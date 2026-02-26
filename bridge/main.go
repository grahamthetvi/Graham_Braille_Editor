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
// CORS is permissive so that the GitHub Pages client can reach localhost.
// The server binds to 127.0.0.1 only (not 0.0.0.0).
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"runtime"

	"fyne.io/systray"
)

const listenAddr = "127.0.0.1:8080"

// ---------------------------------------------------------------------------
// CORS middleware
// ---------------------------------------------------------------------------

func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Allow any origin — the server is localhost-only, so this is safe.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// Handle pre-flight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
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

	if err := sendToPrinter(req.Printer, rawBytes); err != nil {
		http.Error(w, fmt.Sprintf("print failed: %v", err), http.StatusInternalServerError)
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
	mOpen := systray.AddMenuItem("Open Braille Vibe Editor", "Launch the web app")
	mQuit := systray.AddMenuItem("Quit", "Quit the bridge")

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openBrowser("https://grahamthetvi.github.io/Graham_Braille_Editor/")
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
