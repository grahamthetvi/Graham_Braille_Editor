package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	githubLatestURL = "https://api.github.com/repos/grahamthetvi/Graham_Braille_Editor/releases/latest"
	updateCacheTTL  = 24 * time.Hour
)

type githubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

type updateInfo struct {
	LatestVersion string
	AssetName     string
	DownloadURL   string
}

var (
	updateMu       sync.Mutex
	cachedRelease  *githubRelease
	cachedAt       time.Time
	updateInFlight bool
)

func normalizeVersion(v string) string {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if v == "" || v == "dev" {
		return "0.0.0"
	}
	return v
}

// compareSemver returns -1 if a < b, 0 if equal, 1 if a > b.
// Accepts optional leading "v". Non-numeric segments compare as strings after numeric parts.
func compareSemver(a, b string) int {
	a = normalizeVersion(a)
	b = normalizeVersion(b)
	if a == b {
		return 0
	}
	as := strings.Split(a, ".")
	bs := strings.Split(b, ".")
	n := len(as)
	if len(bs) > n {
		n = len(bs)
	}
	for i := 0; i < n; i++ {
		var av, bv string
		if i < len(as) {
			av = as[i]
		}
		if i < len(bs) {
			bv = bs[i]
		}
		an, aErr := strconv.Atoi(av)
		bn, bErr := strconv.Atoi(bv)
		if aErr == nil && bErr == nil {
			if an < bn {
				return -1
			}
			if an > bn {
				return 1
			}
			continue
		}
		if av < bv {
			return -1
		}
		if av > bv {
			return 1
		}
	}
	return 0
}

func expectedReleaseAsset() (name string, installKind string) {
	switch runtime.GOOS {
	case "windows":
		return "graham-bridge-windows.zip", "zip"
	case "linux":
		exe, err := os.Executable()
		if err == nil {
			exe, _ = filepath.EvalSymlinks(exe)
			if isRPMLinuxInstall(exe) {
				return "", "rpm" // name matched later by suffix
			}
		}
		if runtime.GOARCH == "arm64" {
			return "graham-bridge-linux-arm64.zip", "zip"
		}
		return "graham-bridge-linux.zip", "zip"
	default:
		return "", "unsupported"
	}
}

func isRPMLinuxInstall(exe string) bool {
	return strings.HasPrefix(exe, "/usr/bin/")
}

func fetchLatestRelease() (*githubRelease, error) {
	req, err := http.NewRequest(http.MethodGet, githubLatestURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "GrahamBridge/"+Version)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("GitHub API %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	if rel.TagName == "" {
		return nil, fmt.Errorf("release missing tag_name")
	}
	return &rel, nil
}

func pickAsset(rel *githubRelease) (*updateInfo, error) {
	wantName, kind := expectedReleaseAsset()
	if kind == "unsupported" {
		return nil, fmt.Errorf("auto-update is not supported on %s", runtime.GOOS)
	}
	info := &updateInfo{LatestVersion: strings.TrimPrefix(rel.TagName, "v")}
	if kind == "rpm" {
		suffix := "-linux-fedora.x86_64.rpm"
		for _, a := range rel.Assets {
			if strings.HasPrefix(a.Name, "graham-bridge-") && strings.HasSuffix(a.Name, suffix) {
				info.AssetName = a.Name
				info.DownloadURL = a.BrowserDownloadURL
				return info, nil
			}
		}
		return nil, fmt.Errorf("no Fedora RPM asset found in latest release")
	}
	for _, a := range rel.Assets {
		if a.Name == wantName {
			info.AssetName = a.Name
			info.DownloadURL = a.BrowserDownloadURL
			return info, nil
		}
	}
	return nil, fmt.Errorf("asset %q not found in latest release", wantName)
}

// checkForUpdate returns update info when a newer release exists.
func checkForUpdate(force bool) (*updateInfo, error) {
	var rel *githubRelease
	updateMu.Lock()
	if !force && cachedRelease != nil && time.Since(cachedAt) < updateCacheTTL {
		rel = cachedRelease
		updateMu.Unlock()
	} else {
		updateMu.Unlock()
		var err error
		rel, err = fetchLatestRelease()
		if err != nil {
			return nil, err
		}
		updateMu.Lock()
		cachedRelease = rel
		cachedAt = time.Now()
		updateMu.Unlock()
	}

	latest := strings.TrimPrefix(rel.TagName, "v")
	if compareSemver(Version, latest) >= 0 {
		return nil, nil
	}
	return pickAsset(rel)
}

func downloadToFile(url, dest string) error {
	if !strings.HasPrefix(url, "https://") {
		return fmt.Errorf("refusing non-HTTPS download URL")
	}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "GrahamBridge/"+Version)
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: %s", resp.Status)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func applyUpdate(info *updateInfo) error {
	updateMu.Lock()
	if updateInFlight {
		updateMu.Unlock()
		return fmt.Errorf("an update is already in progress")
	}
	updateInFlight = true
	updateMu.Unlock()
	defer func() {
		updateMu.Lock()
		updateInFlight = false
		updateMu.Unlock()
	}()

	_, kind := expectedReleaseAsset()
	tmpDir, err := os.MkdirTemp("", "graham-bridge-update-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)

	dest := filepath.Join(tmpDir, info.AssetName)
	log.Printf("Downloading %s …", info.AssetName)
	if err := downloadToFile(info.DownloadURL, dest); err != nil {
		return err
	}

	switch kind {
	case "rpm":
		return applyRPMUpdate(dest)
	case "zip":
		return applyZipUpdate(dest)
	default:
		return fmt.Errorf("unsupported install kind %q", kind)
	}
}
