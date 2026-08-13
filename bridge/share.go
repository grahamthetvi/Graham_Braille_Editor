package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

// PrintTarget is returned by GET /printers (loopback) for local and remote embossers.
type PrintTarget struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Kind    string `json:"kind"` // "local" | "peer"
	Printer string `json:"printer"`
	PeerID  string `json:"peerId,omitempty"`
}

func handlePrintersExtended(w http.ResponseWriter, _ *http.Request) {
	targets := buildPrintTargets()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(targets)
}

func buildPrintTargets() []PrintTarget {
	var out []PrintTarget
	for _, name := range listPrinters() {
		out = append(out, PrintTarget{
			ID:      "local:" + name,
			Name:    name,
			Kind:    "local",
			Printer: name,
		})
	}
	c := getConfig()
	for _, peer := range c.PairedPeers {
		names, err := fetchPeerPrinters(peer)
		if err != nil {
			log.Printf("peer printers %s: %v", peer.Name, err)
			// Still expose a placeholder so the teacher sees the peer is configured.
			out = append(out, PrintTarget{
				ID:      fmt.Sprintf("peer:%s:", peer.ID),
				Name:    peer.Name + " (unreachable)",
				Kind:    "peer",
				Printer: "",
				PeerID:  peer.ID,
			})
			continue
		}
		for _, pname := range names {
			out = append(out, PrintTarget{
				ID:      fmt.Sprintf("peer:%s:%s", peer.ID, pname),
				Name:    peer.Name + " / " + pname,
				Kind:    "peer",
				Printer: pname,
				PeerID:  peer.ID,
			})
		}
	}
	if out == nil {
		out = []PrintTarget{}
	}
	return out
}

func fetchPeerPrinters(peer PairedPeer) ([]string, error) {
	base := peerBaseURL(peer.Host)
	if base == "" {
		return nil, fmt.Errorf("empty host")
	}
	req, err := http.NewRequest(http.MethodGet, base+"/peer/printers", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+peer.Token)
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return nil, fmt.Errorf("status %d: %s", res.StatusCode, string(body))
	}
	var names []string
	if err := json.NewDecoder(res.Body).Decode(&names); err != nil {
		return nil, err
	}
	return names, nil
}

func relayPrintToPeer(peer PairedPeer, printer string, dataB64 string) error {
	base := peerBaseURL(peer.Host)
	if base == "" {
		return fmt.Errorf("empty peer host")
	}
	payload, _ := json.Marshal(printRequest{Printer: printer, Data: dataB64})
	req, err := http.NewRequest(http.MethodPost, base+"/peer/print", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+peer.Token)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
		return fmt.Errorf("peer print failed (%d): %s", res.StatusCode, string(body))
	}
	return nil
}

func findPeer(id string) (PairedPeer, bool) {
	c := getConfig()
	for _, p := range c.PairedPeers {
		if p.ID == id {
			return p, true
		}
	}
	return PairedPeer{}, false
}

func parseTargetID(id string) (kind, peerID, printer string) {
	if strings.HasPrefix(id, "local:") {
		return "local", "", strings.TrimPrefix(id, "local:")
	}
	if strings.HasPrefix(id, "peer:") {
		rest := strings.TrimPrefix(id, "peer:")
		// peer:<id>:<printer...> — peer id is hex without colons
		idx := strings.IndexByte(rest, ':')
		if idx < 0 {
			return "peer", rest, ""
		}
		return "peer", rest[:idx], rest[idx+1:]
	}
	// Legacy: bare OS printer name
	return "local", "", id
}

// ---------------------------------------------------------------------------
// Settings API (loopback only, behind withCORS)
// ---------------------------------------------------------------------------

func handleSettingsGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	c := getConfig()
	type peerPublic struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Host string `json:"host"`
	}
	peers := make([]peerPublic, 0, len(c.PairedPeers))
	for _, p := range c.PairedPeers {
		peers = append(peers, peerPublic{ID: p.ID, Name: p.Name, Host: p.Host})
	}
	code := ""
	if c.ShareEnabled {
		code = c.ShareCode
	}
	inboxPath := c.InboxPath
	if inboxPath == "" {
		inboxPath = defaultInboxPath()
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"shareEnabled":      c.ShareEnabled,
		"shareName":         c.ShareName,
		"shareCode":         code,
		"peerPort":          peerPort,
		"pairedPeers":       peers,
		"inboxEnabled":      c.InboxEnabled,
		"inboxPath":         inboxPath,
		"inboxPrinter":      c.InboxPrinter,
		"inboxCellsPerRow":  c.InboxCellsPerRow,
		"inboxLinesPerPage": c.InboxLinesPerPage,
		"inboxLeftPadCells": c.InboxLeftPadCells,
		"localPrinters":     listPrinters(),
	})
}

func handleSettingsShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req struct {
		Enabled *bool  `json:"enabled"`
		Name    string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	cfgMu.Lock()
	if req.Name != "" {
		cfg.ShareName = strings.TrimSpace(req.Name)
	}
	if req.Enabled != nil {
		cfg.ShareEnabled = *req.Enabled
		if cfg.ShareEnabled {
			if err := ensureShareSecretsLocked(); err != nil {
				cfgMu.Unlock()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}
	if err := saveConfigLocked(); err != nil {
		cfgMu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	enabled := cfg.ShareEnabled
	code := cfg.ShareCode
	name := cfg.ShareName
	cfgMu.Unlock()

	if enabled {
		startPeerServerIfNeeded()
	} else {
		stopPeerServer()
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"shareEnabled": enabled,
		"shareName":    name,
		"shareCode":    code,
	})
}

func handleSettingsRegenerateCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfgMu.Lock()
	code, err := generateShareCode()
	if err != nil {
		cfgMu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	tok, err := randomHex(24)
	if err != nil {
		cfgMu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cfg.ShareCode = code
	cfg.ShareCodeHash = hashShareCode(code)
	cfg.ShareToken = tok
	if err := saveConfigLocked(); err != nil {
		cfgMu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cfgMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"shareCode": code})
}

func handleSettingsPair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req struct {
		Host string `json:"host"`
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	req.Host = strings.TrimSpace(req.Host)
	req.Code = strings.TrimSpace(req.Code)
	base := peerBaseURL(req.Host)
	if base == "" || req.Code == "" {
		http.Error(w, "host and code are required", http.StatusBadRequest)
		return
	}

	payload, _ := json.Marshal(map[string]string{"code": req.Code})
	httpReq, err := http.NewRequest(http.MethodPost, base+"/peer/pair", bytes.NewReader(payload))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Do(httpReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("cannot reach shared Bridge: %v", err), http.StatusBadGateway)
		return
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
	if res.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("pairing failed (%d): %s", res.StatusCode, string(body)), res.StatusCode)
		return
	}
	var pairResp struct {
		Token string `json:"token"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(body, &pairResp); err != nil || pairResp.Token == "" {
		http.Error(w, "invalid pair response", http.StatusBadGateway)
		return
	}

	id, err := randomHex(8)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	hostStore := strings.TrimPrefix(strings.TrimPrefix(base, "http://"), "https://")

	cfgMu.Lock()
	// Replace existing peer with same host
	filtered := make([]PairedPeer, 0, len(cfg.PairedPeers))
	for _, p := range cfg.PairedPeers {
		if peerBaseURL(p.Host) != base {
			filtered = append(filtered, p)
		}
	}
	cfg.PairedPeers = append(filtered, PairedPeer{
		ID:    id,
		Name:  pairResp.Name,
		Host:  hostStore,
		Token: pairResp.Token,
	})
	if err := saveConfigLocked(); err != nil {
		cfgMu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cfgMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"id":   id,
		"name": pairResp.Name,
		"host": hostStore,
	})
}

func handleSettingsUnpair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	cfgMu.Lock()
	kept := make([]PairedPeer, 0, len(cfg.PairedPeers))
	for _, p := range cfg.PairedPeers {
		if p.ID != req.ID {
			kept = append(kept, p)
		}
	}
	cfg.PairedPeers = kept
	if err := saveConfigLocked(); err != nil {
		cfgMu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	cfgMu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
