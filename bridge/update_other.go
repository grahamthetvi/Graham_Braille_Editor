//go:build !windows && !linux

package main

import "fmt"

func applyZipUpdate(string) error {
	return fmt.Errorf("auto-update is not supported on this platform")
}

func applyRPMUpdate(string) error {
	return fmt.Errorf("auto-update is not supported on this platform")
}
