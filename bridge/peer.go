package main

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	peerServerMu sync.Mutex
	peerServer   *http.Server
	pairFailMu   sync.Mutex
	pairFails    = map[string][]time.Time{}
)

func startPeerServerIfNeeded() {
	c := getConfig()
	if !c.ShareEnabled {
		stopPeerServer()
		return
	}
	peerServerMu.Lock()
	defer peerServerMu.Unlock()
	if peerServer != nil {
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/peer/status", peerStatusHandler)
	mux.HandleFunc("/peer/pair", peerPairHandler)
	mux.HandleFunc("/peer/printers", peerPrintersHandler)
	mux.HandleFunc("/peer/print", peerPrintHandler)

	srv := &http.Server{
		Addr:              peerListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	peerServer = srv
	go func() {
		log.Printf("Graham Bridge share listener on http://%s", peerListenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("peer server error: %v", err)
		}
	}()
}

func stopPeerServer() {
	peerServerMu.Lock()
	defer peerServerMu.Unlock()
	if peerServer == nil {
		return
	}
	_ = peerServer.Close()
	peerServer = nil
	log.Printf("Graham Bridge share listener stopped")
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func requirePeerToken(w http.ResponseWriter, r *http.Request) bool {
	c := getConfig()
	if !c.ShareEnabled || c.ShareToken == "" {
		http.Error(w, "share mode is off", http.StatusServiceUnavailable)
		return false
	}
	tok := bearerToken(r)
	if !tokenMatches(tok, c.ShareToken) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return false
	}
	return true
}

func tokenMatches(got, want string) bool {
	if want == "" || got == "" {
		return false
	}
	if len(got) != len(want) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}

func peerStatusHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requirePeerToken(w, r) {
		return
	}
	c := getConfig()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "ok",
		"app":     "graham-bridge",
		"name":    c.ShareName,
		"version": Version,
		"build":   BuildNumber,
	})
}

func peerPairHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	c := getConfig()
	if !c.ShareEnabled {
		http.Error(w, "share mode is off", http.StatusServiceUnavailable)
		return
	}

	ip := clientIP(r)
	if !allowPairAttempt(ip) {
		http.Error(w, "too many attempts — try again later", http.StatusTooManyRequests)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	req.Code = strings.TrimSpace(req.Code)
	if !codesEqual(req.Code, c.ShareCodeHash) {
		recordPairFail(ip)
		http.Error(w, "invalid code", http.StatusUnauthorized)
		return
	}
	clearPairFails(ip)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"token": c.ShareToken,
		"name":  c.ShareName,
	})
}

func peerPrintersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requirePeerToken(w, r) {
		return
	}
	printers := listPrinters()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(printers)
}

func peerPrintHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !requirePeerToken(w, r) {
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 5*1024*1024)
	var req printRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid JSON: %v", err), http.StatusBadRequest)
		return
	}
	if err := validatePrinterName(req.Printer); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
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

	log.Printf("peer print: printer=%q bytes=%d", req.Printer, len(rawBytes))
	brfText := string(rawBytes)
	if len(brfText) > 4096 {
		brfText = brfText[:4096]
	}
	printErr := sendToPrinter(req.Printer, rawBytes)
	e := JobEvent{
		Time:    time.Now(),
		Printer: req.Printer + " (shared)",
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
	_, _ = w.Write([]byte(`{"status":"queued"}`))
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func allowPairAttempt(ip string) bool {
	pairFailMu.Lock()
	defer pairFailMu.Unlock()
	cutoff := time.Now().Add(-5 * time.Minute)
	fails := pairFails[ip]
	kept := fails[:0]
	for _, t := range fails {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	pairFails[ip] = kept
	return len(kept) < 10
}

func recordPairFail(ip string) {
	pairFailMu.Lock()
	defer pairFailMu.Unlock()
	pairFails[ip] = append(pairFails[ip], time.Now())
}

func clearPairFails(ip string) {
	pairFailMu.Lock()
	defer pairFailMu.Unlock()
	delete(pairFails, ip)
}

func validatePrinterName(name string) error {
	if name == "" {
		return fmt.Errorf("printer name is required")
	}
	if len(name) > 255 {
		return fmt.Errorf("printer name is too long")
	}
	for _, char := range name {
		if char < 32 || char == 127 {
			return fmt.Errorf("invalid characters in printer name")
		}
	}
	return nil
}

func peerBaseURL(host string) string {
	host = strings.TrimSpace(host)
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimRight(host, "/")
	if host == "" {
		return ""
	}
	if !strings.Contains(host, ":") {
		host = host + ":" + peerPort
	}
	return "http://" + host
}
