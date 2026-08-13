package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestIsInboxBRF(t *testing.T) {
	if !isInboxBRF("doc.brf") || !isInboxBRF("DOC.BRF") {
		t.Fatal("expected .brf files to match")
	}
	if isInboxBRF(".hidden.brf") || isInboxBRF("doc.txt") || isInboxBRF("printed") {
		t.Fatal("unexpected inbox candidate")
	}
}

func TestExpandInboxPathHome(t *testing.T) {
	got := expandInboxPath("~/GrahamInbox")
	if got == "~/GrahamInbox" {
		t.Skip("no home dir")
	}
	if filepath.Base(got) != "GrahamInbox" {
		t.Fatalf("base = %s", filepath.Base(got))
	}
	if !filepath.IsAbs(got) {
		t.Fatalf("expected absolute path, got %s", got)
	}
}

func TestUniqueDest(t *testing.T) {
	dir := t.TempDir()
	first := uniqueDest(dir, "a.brf")
	if filepath.Base(first) != "a.brf" {
		t.Fatalf("first dest %s", first)
	}
	if err := os.WriteFile(first, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	second := uniqueDest(dir, "a.brf")
	if second == first {
		t.Fatal("expected unique name after collision")
	}
	if filepath.Ext(second) != ".brf" {
		t.Fatalf("ext %s", filepath.Ext(second))
	}
}

func TestInboxAlreadySeen(t *testing.T) {
	dir := t.TempDir()
	if inboxAlreadySeen(dir, "abc") {
		t.Fatal("empty should not be seen")
	}
	if err := recordInboxSeen(dir, "abc"); err != nil {
		t.Fatal(err)
	}
	if !inboxAlreadySeen(dir, "abc") {
		t.Fatal("expected hash recorded")
	}
	if inboxAlreadySeen(dir, "zzz") {
		t.Fatal("other hash should not match")
	}
}

func TestMoveInboxFile(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "in.brf")
	if err := os.WriteFile(src, []byte("brf"), 0o600); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(dir, "printed")
	if err := moveInboxFile(src, dest, "in.brf"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "in.brf")); err != nil {
		t.Fatal(err)
	}
}

func TestInboxSeenKey_IncludesLayout(t *testing.T) {
	data := []byte("hello")
	base := inboxLayout{cellsPerRow: 32, linesPerPage: 25, leftPadCells: 0}
	a := inboxSeenKey(data, base)
	b := inboxSeenKey(data, inboxLayout{cellsPerRow: 40, linesPerPage: 25, leftPadCells: 0})
	c := inboxSeenKey(data, inboxLayout{cellsPerRow: 32, linesPerPage: 20, leftPadCells: 0})
	d := inboxSeenKey(data, inboxLayout{cellsPerRow: 32, linesPerPage: 25, leftPadCells: 2})
	same := inboxSeenKey(data, base)
	other := inboxSeenKey([]byte("hello!"), base)
	if a == b || a == c || a == d {
		t.Fatal("layout change must change seen key")
	}
	if a != same {
		t.Fatal("same bytes and layout must match")
	}
	if a == other {
		t.Fatal("different bytes must not match")
	}

	dir := t.TempDir()
	if err := recordInboxSeen(dir, a); err != nil {
		t.Fatal(err)
	}
	if !inboxAlreadySeen(dir, a) {
		t.Fatal("expected recorded")
	}
	if inboxAlreadySeen(dir, b) {
		t.Fatal("different layout should not be seen")
	}
}

func TestScanInbox_EmptyBRFMovesToFailed(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "empty.brf")
	if err := os.WriteFile(src, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	prev := map[string]int64{}
	scanInbox(context.Background(), dir, "", prev)
	if _, err := os.Stat(src); err != nil {
		t.Fatal("empty file should stay until size is stable")
	}
	scanInbox(context.Background(), dir, "", prev)
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Fatal("stable empty file should be moved out of inbox")
	}
	if _, err := os.Stat(filepath.Join(dir, failedDirName, "empty.brf")); err != nil {
		t.Fatal(err)
	}
}
