package main

import (
	"reflect"
	"testing"
)

func TestWrapBrailleLine_WordAware(t *testing.T) {
	got := wrapBrailleLine("one two three four", 8)
	want := []string{"one two", "three", "four"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestWrapBrailleLine_HardBreakLongToken(t *testing.T) {
	got := wrapBrailleLine("abcdefghij", 4)
	want := []string{"abcd", "efgh", "ij"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v want %#v", got, want)
	}
}

func TestFormatInboxBRF_WrapAndPaginate(t *testing.T) {
	raw := []byte("one two three four")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 8, linesPerPage: 2, leftPadCells: 0}))
	want := "one two\r\nthree\r\n\ffour\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_PadContentLines(t *testing.T) {
	raw := []byte("hello world")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 8, linesPerPage: 25, leftPadCells: 3}))
	want := "   hello\r\n   world\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_TrimLeadingCells(t *testing.T) {
	raw := []byte("abcdef")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 32, linesPerPage: 25, leftPadCells: -3}))
	want := "def\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_FlattenFormFeedThenRepaginate(t *testing.T) {
	raw := []byte("one two\r\n\fthree four\r\n")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 8, linesPerPage: 2, leftPadCells: 0}))
	want := "one two\r\nthree\r\n\ffour\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_ReflowPullsWordsFromNextLine(t *testing.T) {
	raw := []byte("one two\nthree four")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 16, linesPerPage: 25, leftPadCells: 0}))
	want := "one two three\r\nfour\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_ParagraphBreakNotJoined(t *testing.T) {
	raw := []byte("one two\n\nthree four")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 16, linesPerPage: 25, leftPadCells: 0}))
	want := "one two\r\n\r\nthree four\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_PadSkipsBlankAndFormFeedOnly(t *testing.T) {
	raw := []byte("hello\n\nworld")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 32, linesPerPage: 1, leftPadCells: 2}))
	want := "  hello\r\n\f\r\n\f  world\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_CRLFInput(t *testing.T) {
	raw := []byte("hello\r\nworld\r\n")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 32, linesPerPage: 25, leftPadCells: 0}))
	want := "hello world\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestFormatInboxBRF_PadBeforeFormFeedNextPage(t *testing.T) {
	raw := []byte("hello world")
	got := string(formatInboxBRF(raw, inboxLayout{cellsPerRow: 8, linesPerPage: 1, leftPadCells: 2}))
	want := "  hello\r\n\f  world\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestApplyLeftPad_DoesNotPadFormFeedOnly(t *testing.T) {
	got := applyLeftPad("hello\r\n\f\r\nworld\r\n", 2)
	want := "  hello\r\n\f\r\n  world\r\n"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestClampInboxLayout(t *testing.T) {
	if clampInboxCellsPerRow(0) != defaultInboxCellsPerRow {
		t.Fatal("zero cells should default to 32")
	}
	if clampInboxCellsPerRow(5) != minInboxCellsPerRow {
		t.Fatal("cells below min")
	}
	if clampInboxCellsPerRow(200) != maxInboxCellsPerRow {
		t.Fatal("cells above max")
	}
	if clampInboxLinesPerPage(0) != defaultInboxLinesPerPage {
		t.Fatal("zero lines should default to 25")
	}
	if clampInboxLinesPerPage(2) != minInboxLinesPerPage {
		t.Fatal("lines below min")
	}
	if clampInboxLinesPerPage(99) != maxInboxLinesPerPage {
		t.Fatal("lines above max")
	}
	if clampInboxLeftPadCells(-100) != minInboxLeftPadCells {
		t.Fatal("pad below min")
	}
	if clampInboxLeftPadCells(100) != maxInboxLeftPadCells {
		t.Fatal("pad above max")
	}
	if clampInboxLeftPadCells(0) != 0 {
		t.Fatal("zero pad is valid")
	}
}

func TestNormalizeInboxLayoutZeroConfig(t *testing.T) {
	c := BridgeConfig{}
	normalizeInboxLayout(&c)
	if c.InboxCellsPerRow != 32 || c.InboxLinesPerPage != 25 || c.InboxLeftPadCells != 0 {
		t.Fatalf("defaults: %+v", c)
	}
}
