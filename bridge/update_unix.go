//go:build linux

package main

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
)

func applyZipUpdate(zipPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}
	if isRPMLinuxInstall(exe) {
		return fmt.Errorf("refusing ZIP replace for RPM install at %s — use the RPM update path", exe)
	}

	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	want := "graham-bridge-linux-amd64"
	if runtime.GOARCH == "arm64" {
		want = "graham-bridge-linux-arm64"
	}

	var src io.ReadCloser
	for _, f := range r.File {
		base := filepath.Base(f.Name)
		if base == want || base == "graham-bridge" {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			src = rc
			break
		}
	}
	if src == nil {
		return fmt.Errorf("zip does not contain %s", want)
	}
	defer src.Close()

	dir := filepath.Dir(exe)
	tmp, err := os.CreateTemp(dir, ".graham-bridge-*.new")
	if err != nil {
		return fmt.Errorf("cannot write update next to install (%w)", err)
	}
	tmpName := tmp.Name()
	if _, err := io.Copy(tmp, src); err != nil {
		tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Chmod(0o755); err != nil {
		tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}

	backup := exe + ".bak"
	_ = os.Remove(backup)
	if err := os.Rename(exe, backup); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("cannot replace running binary (%w)", err)
	}
	if err := os.Rename(tmpName, exe); err != nil {
		_ = os.Rename(backup, exe)
		_ = os.Remove(tmpName)
		return err
	}
	_ = os.Remove(backup)

	log.Printf("Updated binary at %s — restarting", exe)
	return relaunchAndExit(exe)
}

func applyRPMUpdate(rpmPath string) error {
	if _, err := exec.LookPath("pkexec"); err != nil {
		return fmt.Errorf("pkexec not found — install the RPM manually: sudo dnf install %s", rpmPath)
	}
	if _, err := exec.LookPath("dnf"); err != nil {
		return fmt.Errorf("dnf not found — install the RPM manually with your package manager")
	}

	cmd := exec.Command("pkexec", "dnf", "install", "-y", rpmPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("dnf install failed: %w", err)
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	log.Printf("RPM upgraded — restarting %s", exe)
	return relaunchAndExit(exe)
}

func relaunchAndExit(exe string) error {
	cmd := exec.Command(exe)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() {
		time.Sleep(200 * time.Millisecond)
		os.Exit(0)
	}()
	return nil
}
