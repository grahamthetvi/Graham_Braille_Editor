//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

// Windows spooler API via winspool.drv
//
// We use syscall.LoadDLL rather than cgo so the binary can be built
// with GOOS=windows on Linux (cross-compile) — cgo requires a Windows
// C toolchain. The tradeoff is that we must manage unsafe.Pointer manually.
//
// Required Win32 functions:
//   OpenPrinterW     — open a handle to the named printer
//   StartDocPrinterW — begin a raw document in the spooler
//   StartPagePrinter — (required by some drivers even for raw jobs)
//   WritePrinter     — write raw bytes into the job
//   EndPagePrinter   — close the page
//   EndDocPrinter    — end the document
//   ClosePrinter     — release the handle

var (
	winspool        = syscall.NewLazyDLL("winspool.drv")
	procOpenPrinter = winspool.NewProc("OpenPrinterW")
	procStartDoc    = winspool.NewProc("StartDocPrinterW")
	procStartPage   = winspool.NewProc("StartPagePrinter")
	procWrite       = winspool.NewProc("WritePrinter")
	procEndPage     = winspool.NewProc("EndPagePrinter")
	procEndDoc      = winspool.NewProc("EndDocPrinter")
	procClose       = winspool.NewProc("ClosePrinter")
)

// DOC_INFO_1 corresponds to the Win32 DOC_INFO_1W struct.
type docInfo1 struct {
	pDocName    *uint16
	pOutputFile *uint16
	pDatatype   *uint16
}

// sendToPrinter sends raw BRF bytes to the Windows print spooler.
// This bypasses GDI rendering and is required for ViewPlus embossers.
func sendToPrinter(printerName string, data []byte) error {
	// Open printer handle.
	printerNamePtr, err := syscall.UTF16PtrFromString(printerName)
	if err != nil {
		return fmt.Errorf("encode printer name: %w", err)
	}

	var hPrinter uintptr
	ret, _, lastErr := procOpenPrinter.Call(
		uintptr(unsafe.Pointer(printerNamePtr)),
		uintptr(unsafe.Pointer(&hPrinter)),
		0,
	)
	if ret == 0 {
		return fmt.Errorf("OpenPrinterW failed: %w", lastErr)
	}
	defer procClose.Call(hPrinter) //nolint:errcheck

	// Build DOC_INFO_1 with datatype "RAW".
	docName, _ := syscall.UTF16PtrFromString("Braille Vibe Job")
	datatype, _ := syscall.UTF16PtrFromString("RAW")
	info := &docInfo1{
		pDocName:    docName,
		pOutputFile: nil,
		pDatatype:   datatype,
	}

	ret, _, lastErr = procStartDoc.Call(
		hPrinter,
		1, // level
		uintptr(unsafe.Pointer(info)),
	)
	if ret == 0 {
		return fmt.Errorf("StartDocPrinterW failed: %w", lastErr)
	}

	ret, _, lastErr = procStartPage.Call(hPrinter)
	if ret == 0 {
		return fmt.Errorf("StartPagePrinter failed: %w", lastErr)
	}

	var written uint32
	ret, _, lastErr = procWrite.Call(
		hPrinter,
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)),
		uintptr(unsafe.Pointer(&written)),
	)
	if ret == 0 {
		return fmt.Errorf("WritePrinter failed: %w", lastErr)
	}
	if int(written) != len(data) {
		return fmt.Errorf("WritePrinter wrote %d of %d bytes", written, len(data))
	}

	procEndPage.Call(hPrinter) //nolint:errcheck
	procEndDoc.Call(hPrinter)  //nolint:errcheck

	return nil
}
