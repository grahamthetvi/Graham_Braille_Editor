package main

import "strings"

const (
	defaultInboxCellsPerRow  = 32
	defaultInboxLinesPerPage = 25
	minInboxCellsPerRow      = 10
	maxInboxCellsPerRow      = 100
	minInboxLinesPerPage     = 5
	maxInboxLinesPerPage     = 50
	minInboxLeftPadCells     = -80
	maxInboxLeftPadCells     = 80
)

type inboxLayout struct {
	cellsPerRow  int
	linesPerPage int
	leftPadCells int
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func clampInboxCellsPerRow(v int) int {
	if v == 0 {
		return defaultInboxCellsPerRow
	}
	return clampInt(v, minInboxCellsPerRow, maxInboxCellsPerRow)
}

func clampInboxLinesPerPage(v int) int {
	if v == 0 {
		return defaultInboxLinesPerPage
	}
	return clampInt(v, minInboxLinesPerPage, maxInboxLinesPerPage)
}

func clampInboxLeftPadCells(v int) int {
	return clampInt(v, minInboxLeftPadCells, maxInboxLeftPadCells)
}

func normalizeInboxLayout(c *BridgeConfig) {
	c.InboxCellsPerRow = clampInboxCellsPerRow(c.InboxCellsPerRow)
	c.InboxLinesPerPage = clampInboxLinesPerPage(c.InboxLinesPerPage)
	c.InboxLeftPadCells = clampInboxLeftPadCells(c.InboxLeftPadCells)
}

func inboxLayoutFromConfig(c BridgeConfig) inboxLayout {
	normalizeInboxLayout(&c)
	return inboxLayout{
		cellsPerRow:  c.InboxCellsPerRow,
		linesPerPage: c.InboxLinesPerPage,
		leftPadCells: c.InboxLeftPadCells,
	}
}

func runeCount(s string) int {
	return len([]rune(s))
}

// wrapBrailleLine ports client wrapBrailleLine: whole words move to the next
// row; only tokens longer than cells are hard-broken. Consecutive spaces collapse.
func wrapBrailleLine(line string, cells int) []string {
	words := strings.Split(line, " ")
	var result []string
	current := ""
	currentLen := 0

	for _, word := range words {
		if word == "" {
			continue
		}
		wlen := runeCount(word)
		if wlen > cells {
			if currentLen > 0 {
				result = append(result, current)
				current = ""
				currentLen = 0
			}
			runes := []rune(word)
			for i := 0; i < len(runes); i += cells {
				end := i + cells
				if end > len(runes) {
					end = len(runes)
				}
				chunk := string(runes[i:end])
				if end-i == cells {
					result = append(result, chunk)
				} else {
					current = chunk
					currentLen = end - i
				}
			}
			continue
		}
		needed := wlen
		if currentLen > 0 {
			needed = currentLen + 1 + wlen
		}
		if needed <= cells {
			if currentLen == 0 {
				current = word
				currentLen = wlen
			} else {
				current = current + " " + word
				currentLen = needed
			}
		} else {
			if currentLen > 0 {
				result = append(result, current)
			}
			current = word
			currentLen = wlen
		}
	}
	if currentLen > 0 {
		result = append(result, current)
	}
	return result
}

// applyLeftPad prefixes (or trims) cells on each content line. Form-feed
// markers stay at the start of the line; empty and form-feed-only lines are
// left unchanged.
func applyLeftPad(formatted string, padCells int) string {
	if padCells == 0 {
		return formatted
	}
	lines := strings.Split(formatted, "\r\n")
	for i, line := range lines {
		ff := ""
		content := line
		if strings.HasPrefix(line, "\f") {
			ff = "\f"
			content = line[len("\f"):]
		}
		if content == "" {
			continue
		}
		if padCells > 0 {
			lines[i] = ff + strings.Repeat(" ", padCells) + content
			continue
		}
		trim := -padCells
		runes := []rune(content)
		if trim >= len(runes) {
			content = ""
		} else {
			content = string(runes[trim:])
		}
		lines[i] = ff + content
	}
	return strings.Join(lines, "\r\n")
}

// flattenInboxParagraphs joins sender-wrapped lines into word streams so a
// wider receiver cells/row can pull words up. Blank (or whitespace-only)
// lines are paragraph breaks. Form feeds must already be stripped.
func flattenInboxParagraphs(rawLines []string) []string {
	var out []string
	var words []string
	flush := func() {
		if len(words) == 0 {
			return
		}
		out = append(out, strings.Join(words, " "))
		words = nil
	}
	for _, line := range rawLines {
		fields := strings.Fields(line)
		if len(fields) == 0 {
			flush()
			out = append(out, "")
			continue
		}
		words = append(words, fields...)
	}
	flush()
	return out
}

// formatInboxBRF re-wraps and re-paginates incoming BRF using this computer's
// inbox layout. Sender form feeds are flattened so receiver lines/page wins.
func formatInboxBRF(raw []byte, layout inboxLayout) []byte {
	s := string(raw)
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\f", "")

	cells := layout.cellsPerRow
	if cells < 1 {
		cells = 1
	}
	linesPerPage := layout.linesPerPage
	if linesPerPage < 1 {
		linesPerPage = 1
	}

	paragraphs := flattenInboxParagraphs(strings.Split(s, "\n"))
	wrapped := make([]string, 0, len(paragraphs))
	for _, para := range paragraphs {
		if para == "" {
			wrapped = append(wrapped, "")
			continue
		}
		if runeCount(para) <= cells {
			wrapped = append(wrapped, para)
			continue
		}
		wrapped = append(wrapped, wrapBrailleLine(para, cells)...)
	}
	for len(wrapped) > 0 && wrapped[len(wrapped)-1] == "" {
		wrapped = wrapped[:len(wrapped)-1]
	}

	var pageChunks []string
	for i := 0; i < len(wrapped); i += linesPerPage {
		end := i + linesPerPage
		if end > len(wrapped) {
			end = len(wrapped)
		}
		pageChunks = append(pageChunks, strings.Join(wrapped[i:end], "\r\n"))
	}
	formatted := strings.Join(pageChunks, "\r\n\f") + "\r\n"
	formatted = applyLeftPad(formatted, layout.leftPadCells)
	return []byte(formatted)
}
