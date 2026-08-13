package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	inboxMaxBytes     = 5 * 1024 * 1024
	inboxPollInterval = 4 * time.Second
	printedDirName    = "printed"
	failedDirName     = "failed"
	seenFileName      = ".graham-seen"
)

type inboxController struct {
	mu   sync.Mutex
	stop context.CancelFunc
	wg   sync.WaitGroup
}

var (
	inboxCtl   inboxController
	inboxJobMu sync.Mutex
)

func restartInboxWatcher() {
	inboxCtl.mu.Lock()
	defer inboxCtl.mu.Unlock()
	stopInboxLocked()
	c := getConfig()
	if !c.InboxEnabled {
		log.Printf("inbox: disabled")
		return
	}
	path := expandInboxPath(c.InboxPath)
	if path == "" {
		log.Printf("inbox: enabled but path is empty")
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	inboxCtl.stop = cancel
	printer := strings.TrimSpace(c.InboxPrinter)
	inboxCtl.wg.Add(1)
	go func() {
		defer inboxCtl.wg.Done()
		runInboxLoop(ctx, path, printer)
	}()
}

func stopInboxWatcher() {
	inboxCtl.mu.Lock()
	defer inboxCtl.mu.Unlock()
	stopInboxLocked()
}

// stopInboxLocked cancels the current watcher and waits for its loop (including
// an in-flight print) to finish so a restart cannot overlap scans.
func stopInboxLocked() {
	if inboxCtl.stop != nil {
		inboxCtl.stop()
		inboxCtl.stop = nil
	}
	inboxCtl.wg.Wait()
}

func expandInboxPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	if p == "~" || strings.HasPrefix(p, "~/") || strings.HasPrefix(p, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil {
			return p
		}
		rest := strings.TrimPrefix(p[1:], "/")
		rest = strings.TrimPrefix(rest, `\`)
		return filepath.Join(home, rest)
	}
	return p
}

func defaultInboxPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "GrahamInbox"
	}
	return filepath.Join(home, "GrahamInbox")
}

func isInboxBRF(name string) bool {
	base := filepath.Base(name)
	if base == "" || strings.HasPrefix(base, ".") {
		return false
	}
	return strings.EqualFold(filepath.Ext(base), ".brf")
}

func runInboxLoop(ctx context.Context, dir, configuredPrinter string) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		log.Printf("inbox: mkdir %s: %v", dir, err)
		return
	}
	log.Printf("inbox: watching %s", dir)
	prevSize := map[string]int64{}
	ticker := time.NewTicker(inboxPollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Printf("inbox: stopped")
			return
		case <-ticker.C:
			scanInbox(ctx, dir, configuredPrinter, prevSize)
		}
	}
}

func scanInbox(ctx context.Context, dir, configuredPrinter string, prevSize map[string]int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		log.Printf("inbox: read %s: %v", dir, err)
		return
	}
	if ctx.Err() != nil {
		return
	}
	seenThisPass := map[string]bool{}
	for _, ent := range entries {
		if ctx.Err() != nil {
			return
		}
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		if !isInboxBRF(name) {
			continue
		}
		full := filepath.Join(dir, name)
		seenThisPass[full] = true
		info, err := os.Stat(full)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		size := info.Size()
		if size > inboxMaxBytes {
			log.Printf("inbox: skip too large %s (%d bytes)", name, size)
			_ = moveInboxFile(full, filepath.Join(dir, failedDirName), name)
			delete(prevSize, full)
			continue
		}
		prev, ok := prevSize[full]
		prevSize[full] = size
		if !ok || prev != size {
			continue // wait until size is stable across two polls
		}
		if size <= 0 {
			log.Printf("inbox: skip empty %s", name)
			_ = moveInboxFile(full, filepath.Join(dir, failedDirName), name)
			delete(prevSize, full)
			continue
		}
		if ctx.Err() != nil {
			return
		}
		processInboxFile(dir, full, name, configuredPrinter)
		delete(prevSize, full)
	}
	for p := range prevSize {
		if !seenThisPass[p] {
			delete(prevSize, p)
		}
	}
}

func processInboxFile(dir, full, name, configuredPrinter string) {
	inboxJobMu.Lock()
	defer inboxJobMu.Unlock()
	if _, err := os.Stat(full); err != nil {
		return
	}
	data, err := os.ReadFile(full)
	if err != nil {
		log.Printf("inbox: read %s: %v", name, err)
		return
	}
	layout := inboxLayoutFromConfig(getConfig())
	key := inboxSeenKey(data, layout)
	if inboxAlreadySeen(dir, key) {
		log.Printf("inbox: already printed hash for %s; moving aside", name)
		_ = moveInboxFile(full, filepath.Join(dir, printedDirName), name)
		return
	}
	printer, err := resolveInboxPrinter(configuredPrinter)
	if err != nil {
		log.Printf("inbox: %s: %v", name, err)
		_ = moveInboxFile(full, filepath.Join(dir, failedDirName), name)
		return
	}
	formatted := formatInboxBRF(data, layout)
	printErr := sendToPrinter(printer, formatted)
	brfText := string(formatted)
	if len(brfText) > 4096 {
		brfText = brfText[:4096]
	}
	e := JobEvent{
		Time:    time.Now(),
		Printer: printer + " (inbox)",
		Bytes:   len(formatted),
		BRFText: brfText,
		HexDump: hexDump(formatted),
	}
	if printErr != nil {
		e.ErrMsg = printErr.Error()
		appendJob(e)
		log.Printf("inbox: print failed %s: %v", name, printErr)
		_ = moveInboxFile(full, filepath.Join(dir, failedDirName), name)
		return
	}
	appendJob(e)
	if err := recordInboxSeen(dir, key); err != nil {
		log.Printf("inbox: record seen: %v", err)
	}
	if err := moveInboxFile(full, filepath.Join(dir, printedDirName), name); err != nil {
		log.Printf("inbox: move printed %s: %v", name, err)
	}
	log.Printf("inbox: printed %s (%d bytes, %d cells/row, %d lines/page, pad %d) to %s",
		name, len(formatted), layout.cellsPerRow, layout.linesPerPage, layout.leftPadCells, printer)
}

func resolveInboxPrinter(configured string) (string, error) {
	configured = strings.TrimSpace(configured)
	if configured != "" {
		if err := validatePrinterName(configured); err != nil {
			return "", err
		}
		return configured, nil
	}
	printers := listPrinters()
	if len(printers) == 0 {
		return "", fmt.Errorf("no local printers found; set an inbox printer in Settings")
	}
	return printers[0], nil
}

func inboxSeenKey(data []byte, layout inboxLayout) string {
	h := sha256.New()
	h.Write(data)
	fmt.Fprintf(h, "\x00%d:%d:%d", layout.cellsPerRow, layout.linesPerPage, layout.leftPadCells)
	return hex.EncodeToString(h.Sum(nil))
}

func inboxSeenPath(dir string) string {
	return filepath.Join(dir, printedDirName, seenFileName)
}

func inboxAlreadySeen(dir, hash string) bool {
	data, err := os.ReadFile(inboxSeenPath(dir))
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.TrimSpace(line) == hash {
			return true
		}
	}
	return false
}

func recordInboxSeen(dir, hash string) error {
	printed := filepath.Join(dir, printedDirName)
	if err := os.MkdirAll(printed, 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(inboxSeenPath(dir), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = fmt.Fprintln(f, hash)
	return err
}

func moveInboxFile(src, destDir, name string) error {
	if err := os.MkdirAll(destDir, 0o700); err != nil {
		return err
	}
	dst := uniqueDest(destDir, name)
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Remove(src)
}

func uniqueDest(dir, name string) string {
	dst := filepath.Join(dir, name)
	if _, err := os.Stat(dst); os.IsNotExist(err) {
		return dst
	}
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	stamp := time.Now().Format("20060102-150405")
	return filepath.Join(dir, stem+"-"+stamp+ext)
}

func handleSettingsInbox(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	var req struct {
		Enabled      *bool  `json:"enabled"`
		Path         string `json:"path"`
		Printer      string `json:"printer"`
		CellsPerRow  *int   `json:"cellsPerRow"`
		LinesPerPage *int   `json:"linesPerPage"`
		LeftPadCells *int   `json:"leftPadCells"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	path := expandInboxPath(req.Path)
	printer := strings.TrimSpace(req.Printer)
	if printer != "" {
		if err := validatePrinterName(printer); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}

	cfgMu.Lock()
	if req.Enabled != nil {
		cfg.InboxEnabled = *req.Enabled
	}
	if strings.TrimSpace(req.Path) != "" {
		cfg.InboxPath = path
	}
	cfg.InboxPrinter = printer
	if req.CellsPerRow != nil {
		cfg.InboxCellsPerRow = clampInboxCellsPerRow(*req.CellsPerRow)
	}
	if req.LinesPerPage != nil {
		cfg.InboxLinesPerPage = clampInboxLinesPerPage(*req.LinesPerPage)
	}
	if req.LeftPadCells != nil {
		cfg.InboxLeftPadCells = clampInboxLeftPadCells(*req.LeftPadCells)
	}
	normalizeInboxLayout(&cfg)
	if cfg.InboxEnabled {
		if cfg.InboxPath == "" {
			cfgMu.Unlock()
			http.Error(w, "inbox folder path is required", http.StatusBadRequest)
			return
		}
		if err := os.MkdirAll(cfg.InboxPath, 0o700); err != nil {
			cfgMu.Unlock()
			http.Error(w, "cannot create inbox folder: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	if err := saveConfigLocked(); err != nil {
		cfgMu.Unlock()
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	enabled := cfg.InboxEnabled
	savedPath := cfg.InboxPath
	savedPrinter := cfg.InboxPrinter
	savedCells := cfg.InboxCellsPerRow
	savedLines := cfg.InboxLinesPerPage
	savedPad := cfg.InboxLeftPadCells
	cfgMu.Unlock()

	restartInboxWatcher()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"inboxEnabled":      enabled,
		"inboxPath":         savedPath,
		"inboxPrinter":      savedPrinter,
		"inboxCellsPerRow":  savedCells,
		"inboxLinesPerPage": savedLines,
		"inboxLeftPadCells": savedPad,
	})
}
