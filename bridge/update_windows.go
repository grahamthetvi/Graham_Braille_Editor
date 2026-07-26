//go:build windows

package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func applyZipUpdate(zipPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.Abs(exe)
	if err != nil {
		return err
	}

	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	var src io.ReadCloser
	for _, f := range r.File {
		base := filepath.Base(f.Name)
		if strings.EqualFold(base, "graham-bridge-windows.exe") || strings.EqualFold(base, "graham-bridge.exe") {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			src = rc
			break
		}
	}
	if src == nil {
		return fmt.Errorf("zip does not contain graham-bridge-windows.exe")
	}
	defer src.Close()

	newPath := exe + ".new"
	out, err := os.OpenFile(newPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return fmt.Errorf("cannot write update next to install (%w) — use the LocalAppData setup installer for auto-updates", err)
	}
	if _, err := io.Copy(out, src); err != nil {
		out.Close()
		_ = os.Remove(newPath)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(newPath)
		return err
	}

	batPath := filepath.Join(os.TempDir(), "graham-bridge-update.bat")
	pid := os.Getpid()
	bat := strings.Join([]string{
		"@echo off",
		"setlocal",
		fmt.Sprintf("set PID=%d", pid),
		fmt.Sprintf("set \"TARGET=%s\"", exe),
		fmt.Sprintf("set \"NEW=%s\"", newPath),
		":wait",
		"tasklist /FI \"PID eq %PID%\" 2>NUL | find \"%PID%\" >NUL",
		"if not errorlevel 1 (",
		"  timeout /t 1 /nobreak >NUL",
		"  goto wait",
		")",
		"move /Y \"%NEW%\" \"%TARGET%\"",
		"start \"\" \"%TARGET%\"",
		"del \"%~f0\"",
	}, "\r\n")

	if err := os.WriteFile(batPath, []byte(bat), 0o755); err != nil {
		_ = os.Remove(newPath)
		return err
	}

	cmd := exec.Command("cmd.exe", "/C", batPath)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		_ = os.Remove(newPath)
		return err
	}
	go func() {
		os.Exit(0)
	}()
	return nil
}

func applyRPMUpdate(string) error {
	return fmt.Errorf("RPM updates are only supported on Linux")
}
