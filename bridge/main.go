// Graham Bridge
//
// A small HTTP server that runs locally on the user's machine and provides
// raw print access to Braille embossers (especially ViewPlus devices).
//
// Endpoints:
//
//	GET  /status  → 200 {"status":"ok"}
//	POST /print   → {"printer":"Name","data":"<base64 BRF>"}
//
// CORS allows only trusted Graham Braille Editor web origins (plus local dev URLs).
// The server binds to 127.0.0.1 only (not 0.0.0.0).
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"

	"fyne.io/systray"
)

const listenAddr = "127.0.0.1:8080"

// BuildNumber is the GitHub Actions run number, set at build time.
var BuildNumber = "dev"

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Prevent DNS Rebinding attacks by validating the Host header
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host // Fallback if no port is present
		}
		if host != "127.0.0.1" && host != "localhost" && host != "[::1]" && host != "::1" {
			http.Error(w, "Forbidden: invalid Host header", http.StatusForbidden)
			return
		}

		origin := r.Header.Get("Origin")

		// Only allow specific trusted origins to prevent Cross-Site Request Forgery (CSRF). 
		// An empty string origin ("") is often sent for same-origin requests or curl commands.
		allowedOrigins := map[string]bool{
			"https://grahamthetvi.github.io":      true,
			"https://grahambrailleeditor.com":     true,
			"https://www.grahambrailleeditor.com": true,
			"http://localhost:5173":               true,
			"http://127.0.0.1:5173":               true,
			"http://localhost:8080":               true,
			"http://127.0.0.1:8080":               true,
			"":                                    true,
		}

		if allowedOrigins[origin] {
			if origin == "" {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			// Needed for Chrome Private Network Access (PNA)
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
		}

		// Handle pre-flight
		if r.Method == http.MethodOptions {
			if !allowedOrigins[origin] {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Actively refuse unauthorized requests at the server level
		if !allowedOrigins[origin] {
			http.Error(w, "Forbidden: origin not allowed", http.StatusForbidden)
			return
		}

		next(w, r)
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// statusHandler returns a simple health-check response.
func statusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	resp := map[string]string{
		"status":  "ok",
		"app":     "graham-bridge",
		"version": "3.4.1",
		"build":   BuildNumber,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// printRequest is the JSON body for the /print endpoint.
type printRequest struct {
	Printer string `json:"printer"` // OS printer name
	Data    string `json:"data"`    // Base64-encoded BRF content
}

// printHandler decodes the request and sends raw bytes to the printer.
func printHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Enforce a 5 MB limit on the request body to prevent memory exhaustion DOS attacks
	r.Body = http.MaxBytesReader(w, r.Body, 5*1024*1024)

	var req printRequest
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	if req.Printer == "" {
		http.Error(w, "printer name is required", http.StatusBadRequest)
		return
	}
	if len(req.Printer) > 255 {
		http.Error(w, "printer name is too long", http.StatusBadRequest)
		return
	}
	for _, char := range req.Printer {
		if char < 32 || char == 127 { // Reject control characters and DEL
			http.Error(w, "invalid characters in printer name", http.StatusBadRequest)
			return
		}
	}
	if req.Data == "" {
		http.Error(w, "data is required", http.StatusBadRequest)
		return
	}

	rawBytes, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid base64 data: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("print request: printer=%q bytes=%d", req.Printer, len(rawBytes))

	// Capture BRF text (first 4 KB) and hex dump before sending.
	brfText := string(rawBytes)
	if len(brfText) > 4096 {
		brfText = brfText[:4096]
	}

	printErr := sendToPrinter(req.Printer, rawBytes)

	// Record the job event for the debug UI.
	e := JobEvent{
		Time:    time.Now(),
		Printer: req.Printer,
		Bytes:   len(rawBytes),
		BRFText: brfText,
		HexDump: hexDump(rawBytes),
	}
	if printErr != nil {
		e.ErrMsg = printErr.Error()
	}
	appendJob(e)

	if printErr != nil {
		http.Error(w, fmt.Sprintf("print failed: %v", printErr), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"queued"}`))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/status", withCORS(statusHandler))
		mux.HandleFunc("/print", withCORS(printHandler))
		mux.HandleFunc("/debug", withCORS(handleDebugPage))
		mux.HandleFunc("/log-stream", withCORS(handleLogStream))
		mux.HandleFunc("/printers", withCORS(handlePrinters))
		mux.HandleFunc("/testprint", withCORS(handleTestPrint))

		log.Printf("Graham Bridge listening on http://%s", listenAddr)
		if err := http.ListenAndServe(listenAddr, mux); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	systray.Run(onReady, onExit)
}

func onReady() {
	systray.SetIcon(iconData)
	systray.SetTitle("Graham Bridge")
	systray.SetTooltip("Graham Bridge – HTTP Print Server")

	mStatus := systray.AddMenuItem("Status: Running on port 8080", "Bridge is running")
	mStatus.Disable()

	systray.AddSeparator()
	mDebug := systray.AddMenuItem("Open Debug Page", "View print logs and test the embosser")
	mOpen := systray.AddMenuItem("Open Graham Bridge Editor", "Launch the web app")
	mQuit := systray.AddMenuItem("Quit", "Quit the bridge")

	go func() {
		for {
			select {
			case <-mDebug.ClickedCh:
				openBrowser("http://" + listenAddr + "/debug")
			case <-mOpen.ClickedCh:
				openBrowser("https://grahambrailleeditor.com/")
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

func onExit() {
	// cleanup if necessary
	log.Println("Shutting down Graham Bridge...")
}

func openBrowser(url string) {
	var err error
	switch runtime.GOOS {
	case "linux":
		err = exec.Command("xdg-open", url).Start()
	case "windows":
		err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		err = exec.Command("open", url).Start()
	default:
		err = fmt.Errorf("unsupported platform")
	}
	if err != nil {
		log.Printf("Failed to open browser: %v", err)
	}
}
