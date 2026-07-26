package main

import "testing"

func TestCompareSemver(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"3.5.0", "3.5.0", 0},
		{"v3.5.0", "3.5.0", 0},
		{"3.4.1", "3.5.0", -1},
		{"3.5.0", "3.4.1", 1},
		{"3.5.0", "3.5.1", -1},
		{"3.10.0", "3.9.0", 1},
		{"dev", "3.5.0", -1},
	}
	for _, tc := range cases {
		if got := compareSemver(tc.a, tc.b); got != tc.want {
			t.Errorf("compareSemver(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestPickAssetZipName(t *testing.T) {
	rel := &githubRelease{
		TagName: "v3.6.0",
		Assets: []struct {
			Name               string `json:"name"`
			BrowserDownloadURL string `json:"browser_download_url"`
		}{
			{Name: "graham-bridge-windows.zip", BrowserDownloadURL: "https://example.com/w.zip"},
			{Name: "graham-bridge-linux.zip", BrowserDownloadURL: "https://example.com/l.zip"},
			{Name: "graham-bridge-linux-arm64.zip", BrowserDownloadURL: "https://example.com/a.zip"},
			{Name: "graham-bridge-3.6.0-linux-fedora.x86_64.rpm", BrowserDownloadURL: "https://example.com/r.rpm"},
		},
	}
	info, err := pickAsset(rel)
	if err != nil {
		t.Logf("pickAsset: %v (GOOS-dependent)", err)
		return
	}
	if info.LatestVersion != "3.6.0" {
		t.Errorf("LatestVersion = %q", info.LatestVersion)
	}
	if info.DownloadURL == "" || info.AssetName == "" {
		t.Errorf("missing asset fields: %+v", info)
	}
}

func TestIsRPMLinuxInstall(t *testing.T) {
	if !isRPMLinuxInstall("/usr/bin/graham-bridge") {
		t.Error("expected /usr/bin to be RPM")
	}
	if isRPMLinuxInstall("/usr/local/bin/graham-bridge") {
		t.Error("/usr/local should use ZIP path, not RPM")
	}
	if isRPMLinuxInstall("/home/user/.local/bin/graham-bridge") {
		t.Error("expected ~/.local to be user ZIP")
	}
}
