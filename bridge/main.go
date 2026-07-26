// Graham Bridge
//
// A small HTTP server that runs locally on the user's machine and provides
// raw print access to Braille embossers (especially ViewPlus devices).
//
// Endpoints (loopback 127.0.0.1:8080 — editor-facing):
//
//	GET  /status  → 200 {"status":"ok"}
//	POST /print   → {"printer":"Name|target-id","data":"<base64>"}
//	GET  /printers → [{id,name,kind,printer,...}]
//
// Optional share listener (0.0.0.0:8081) when Share mode is enabled — Bridge-to-Bridge only.
//
// CORS allows only trusted Graham Braille Editor web origins (plus local dev URLs).
// The editor-facing server binds to 127.0.0.1 only (not 0.0.0.0).
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
	"sync"
	"time"

	"fyne.io/systray"
)

const listenAddr = "127.0.0.1:8080"

// Version is the release semver (no leading "v"), set at build time via ldflags.
var Version = "dev"

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
	c := getConfig()
	resp := map[string]any{
		"status":       "ok",
		"app":          "graham-bridge",
		"version":      Version,
		"build":        BuildNumber,
		"shareEnabled": c.ShareEnabled,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}

// printRequest is the JSON body for the /print endpoint.
type printRequest struct {
	Printer string `json:"printer"` // OS printer name or target id
	Data    string `json:"data"`    // Base64-encoded BRF content
	Target  string `json:"target,omitempty"`
}

// printHandler decodes the request and sends raw bytes to the printer (local or peer).
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

	targetID := req.Target
	if targetID == "" {
		targetID = req.Printer
	}
	if targetID == "" {
		http.Error(w, "printer name is required", http.StatusBadRequest)
		return
	}
	if req.Data == "" {
		http.Error(w, "data is required", http.StatusBadRequest)
		return
	}

	kind, peerID, printerName := parseTargetID(targetID)
	if printerName == "" && kind == "local" {
		printerName = targetID
	}
	if err := validatePrinterName(printerName); err != nil && kind == "local" {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if kind == "peer" && printerName == "" {
		http.Error(w, "shared printer is unreachable or not selected", http.StatusBadRequest)
		return
	}

	rawBytes, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid base64 data: %v", err), http.StatusBadRequest)
		return
	}

	log.Printf("print request: target=%q kind=%s printer=%q bytes=%d", targetID, kind, printerName, len(rawBytes))

	brfText := string(rawBytes)
	if len(brfText) > 4096 {
		brfText = brfText[:4096]
	}

	var printErr error
	displayPrinter := printerName
	if kind == "peer" {
		peer, ok := findPeer(peerID)
		if !ok {
			http.Error(w, "unknown shared Bridge", http.StatusBadRequest)
			return
		}
		displayPrinter = peer.Name + " / " + printerName
		printErr = relayPrintToPeer(peer, printerName, req.Data)
	} else {
		printErr = sendToPrinter(printerName, rawBytes)
	}

	e := JobEvent{
		Time:    time.Now(),
		Printer: displayPrinter,
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
	loadConfig()
	startPeerServerIfNeeded()

	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/status", withCORS(statusHandler))
		mux.HandleFunc("/print", withCORS(printHandler))
		mux.HandleFunc("/debug", withCORS(handleDebugPage))
		mux.HandleFunc("/log-stream", withCORS(handleLogStream))
		mux.HandleFunc("/printers", withCORS(handlePrintersExtended))
		mux.HandleFunc("/testprint", withCORS(handleTestPrint))
		mux.HandleFunc("/settings", withCORS(handleSettingsPage))
		mux.HandleFunc("/settings/api", withCORS(handleSettingsGet))
		mux.HandleFunc("/settings/share", withCORS(handleSettingsShare))
		mux.HandleFunc("/settings/regenerate-code", withCORS(handleSettingsRegenerateCode))
		mux.HandleFunc("/settings/pair", withCORS(handleSettingsPair))
		mux.HandleFunc("/settings/unpair", withCORS(handleSettingsUnpair))

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

	statusLabel := "Status: Running on port 8080"
	if getConfig().ShareEnabled {
		statusLabel = "Status: Sharing on port 8081"
	}
	mStatus := systray.AddMenuItem(statusLabel, "Bridge is running")
	mStatus.Disable()

	systray.AddSeparator()
	mSettings := systray.AddMenuItem("Open Settings", "Share mode and connect to a shared Bridge")
	mDebug := systray.AddMenuItem("Open Debug Page", "View print logs and test the embosser")
	mOpen := systray.AddMenuItem("Open Graham Bridge Editor", "Launch the web app")
	systray.AddSeparator()
	mUpdate := systray.AddMenuItem("Check for updates", "Download and install the latest Graham Bridge")
	mUpdateStatus := systray.AddMenuItem("Updates: idle", "")
	mUpdateStatus.Disable()
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Quit the bridge")

	setUpdateStatus := func(msg string) {
		mUpdateStatus.SetTitle(msg)
	}

	pendingUpdate := (*updateInfo)(nil)
	var pendingMu sync.Mutex

	refreshUpdateMenu := func(info *updateInfo) {
		pendingMu.Lock()
		pendingUpdate = info
		pendingMu.Unlock()
		if info == nil {
			mUpdate.SetTitle("Check for updates")
			setUpdateStatus("Up to date (v" + Version + ")")
			return
		}
		mUpdate.SetTitle("Update available — install now")
		setUpdateStatus("v" + info.LatestVersion + " ready")
	}

	go func() {
		time.Sleep(3 * time.Second)
		info, err := checkForUpdate(false)
		if err != nil {
			log.Printf("startup update check: %v", err)
			setUpdateStatus("Update check failed")
			return
		}
		refreshUpdateMenu(info)
	}()

	go func() {
		for {
			select {
			case <-mSettings.ClickedCh:
				openBrowser("http://" + listenAddr + "/settings")
			case <-mDebug.ClickedCh:
				openBrowser("http://" + listenAddr + "/debug")
			case <-mOpen.ClickedCh:
				openBrowser("https://grahambrailleeditor.com/")
			case <-mUpdate.ClickedCh:
				pendingMu.Lock()
				info := pendingUpdate
				pendingMu.Unlock()
				if info != nil {
					setUpdateStatus("Downloading v" + info.LatestVersion + "…")
					mUpdate.Disable()
					go func(u *updateInfo) {
						defer mUpdate.Enable()
						if err := applyUpdate(u); err != nil {
							log.Printf("update apply failed: %v", err)
							setUpdateStatus("Update failed — see log")
							return
						}
						setUpdateStatus("Update installed — restarting…")
					}(info)
					continue
				}
				mUpdate.Disable()
				go func() {
					defer mUpdate.Enable()
					setUpdateStatus("Checking for updates…")
					info, err := checkForUpdate(true)
					if err != nil {
						log.Printf("update check failed: %v", err)
						setUpdateStatus("Update check failed — see log")
						return
					}
					refreshUpdateMenu(info)
					if info == nil {
						return
					}
					// Offer install on next click; also auto-apply when user clicked check and one is available
					setUpdateStatus("Downloading v" + info.LatestVersion + "…")
					if err := applyUpdate(info); err != nil {
						log.Printf("update apply failed: %v", err)
						setUpdateStatus("Update failed — see log")
						return
					}
					setUpdateStatus("Update installed — restarting…")
				}()
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

func onExit() {
	stopPeerServer()
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
