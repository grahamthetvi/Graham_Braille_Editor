# Braille Vibe — Architecture

## Overview

Braille Vibe is a client-side web application that converts text into any
liblouis braille table and optionally sends the output to a physical embosser
via a local Go bridge binary.  All braille translation happens in the browser
via WebAssembly — no server-side translation component is required.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (GitHub Pages)                                          │
│                                                                  │
│  ┌──────────────┐    debounce    ┌──────────────────────────┐   │
│  │ Monaco Editor│ ─────500ms──▶  │  useBraille hook         │   │
│  │ (text input) │                │  • postMessage({text,    │   │
│  └──────────────┘                │      table})             │   │
│                                  └──────────┬───────────────┘   │
│  ┌──────────────┐                           │                   │
│  │  Table       │ ─── selectedTable ───────▶│                   │
│  │  Selector    │                           ▼                   │
│  └──────────────┘       ┌──────────────────────────────────┐    │
│                          │  braille.worker.ts (Web Worker)  │    │
│  ┌──────────────┐        │  ┌────────────────────────────┐  │    │
│  │  File Upload │        │  │ liblouis.wasm (Emscripten) │  │    │
│  └──────────────┘        │  │ easy-api.js wrapper        │  │    │
│                          │  └──────────────────────────────┘  │    │
│  ┌──────────────┐        │  Chunked translation:             │    │
│  │  BRF Preview │◀──────│  • <5 000 chars → single call     │    │
│  │ (Unicode ⠃⠗⠇)│  RESULT│  • ≥5 000 chars → paragraph chunks│    │
│  └──────────────┘        │    + PROGRESS events (0-100%)     │    │
│                          └──────────────────────────────────┘    │
│  ┌──────────────┐                                                │
│  │  Download    │ ── translatedText (.brf) ──▶ browser download  │
│  │  BRF button  │                                                │
│  └──────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
             │  HTTP POST /print (optional)
             ▼
┌────────────────────────┐
│  Go bridge binary      │
│  (localhost:8080)      │
│  Raw print → embosser  │
└────────────────────────┘
```

---

## Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 7 (ESM workers, manual chunks) |
| Code editor | Monaco Editor |
| Braille engine | **liblouis** via WASM (liblouis-js npm package) |
| Worker | ES Module Web Worker (off-main-thread translation) |
| Deployment | GitHub Pages (static, no server) |
| Bridge | Go binary (optional, for embosser printing) |

---

## Translation Pipeline

### 1. Text Input
The user types in Monaco Editor or loads a `.txt` file via the file picker.
The Editor component debounces calls to `onTextChange` by **500 ms** so rapid
keystrokes don't spam the worker.

### 2. Table Selection
The header toolbar exposes a `<select>` with grouped `<optgroup>` elements
sourced from `src/utils/tableRegistry.ts`.  The registry maps human-readable
names to liblouis table filenames (e.g. `en-ueb-g2.ctb`).  Every table
available in `public/tables/` is covered across 12 language groups.

When the selection changes, the hook re-translates the current text with the
new table.

### 3. Web Worker (braille.worker.ts)

The worker runs **entirely off the main thread**, so translation of even very
large documents does not freeze the UI.

**Initialisation** (runs once on startup):

1. Fetches `public/wasm/liblouis.wasm`.  Inspects the first 4 bytes:
   - `00 61 73 6D` → real WASM binary → instantiate via Emscripten glue
   - Anything else → asm.js fallback (written to the same slot by setup script)
2. Executes `public/wasm/easy-api.js` (the liblouis Easy API wrapper).
3. Calls `enableOnDemandTableLoading(BASE + '/tables/')` — liblouis will
   fetch any `.ctb`/`.cti`/`.tbl` file it needs on demand, caching it in
   the WASM in-memory filesystem.

**Translation**:

```
receive { text, table }
│
├─ text.length < 5 000 chars ──▶ translateString(table, text)
│                                 postMessage { type: 'RESULT', result }
│
└─ text.length ≥ 5 000 chars ──▶ splitIntoChunks(text)
                                  for each chunk:
                                    translateString(table, chunk)
                                    postMessage { type: 'PROGRESS', percent }
                                  join chunks → postMessage { type: 'RESULT' }
```

**Chunking strategy** (`splitIntoChunks`):

- Target chunk size: **5 000 characters** (~900 words).
- Prefers to break at `\n\n` (paragraph boundary) to preserve braille
  formatting semantics — contractions are resolved within each paragraph,
  matching the approach used in BrailleBlaster.
- Falls back to `\n` then hard character limit if no paragraph break exists
  within the window.
- Chunks are joined with `''` (preserving whatever whitespace was already at
  the split point) so no synthetic newlines are introduced.

### 4. useBraille Hook

`src/hooks/useBraille.ts` owns the worker lifecycle:

- Spawns the worker on mount, terminates it on unmount.
- Exposes `translate(text, table)`, `translatedText`, `isLoading`, `progress`
  (0–100), `error`, and `workerReady`.
- `progress` resets to 0 at the start of every new job; updated by
  `PROGRESS` messages; set to 100 on `RESULT`.

### 5. Output

**BRF Preview** — `asciiToUnicodeBraille()` converts the raw BRF ASCII output
(liblouis standard: space = U+0020, A–Z = braille dots 1–6) into Unicode
Braille Pattern characters (U+2800–U+283F) for on-screen rendering.

**Download** — The raw BRF string is offered as `output.brf` via a Blob
download.  BRF is the standard interchange format read by embossers and screen
readers.

### 6. Optional Go Bridge

A small Go binary (`bridge/`) listens on `localhost:8080` and exposes:

| Endpoint | Method | Purpose |
|---|---|---|
| `/status` | GET | Health-check; polled every 5 s by the app |
| `/print`  | POST | Receive `{ printer, data: base64-BRF }` → raw print |

The bridge is **entirely optional** — all braille translation works without it.
It is only needed for sending BRF to a physical braille embosser.

---

## File Structure

```
Graham_Braille_Editor/
├── ARCHITECTURE.md          ← this file
├── MATH_STRATEGY.md         ← LaTeX → MathML → Nemeth/UEB strategy (WIP)
├── bridge/                  ← Go bridge binary for embosser printing
│   ├── main.go
│   ├── print_unix.go
│   └── print_windows.go
├── client/                  ← Vite + React application
│   ├── public/
│   │   ├── wasm/
│   │   │   ├── liblouis.wasm    ← compiled liblouis (WASM or asm.js fallback)
│   │   │   ├── liblouis.js      ← Emscripten JS glue
│   │   │   └── easy-api.js      ← patched liblouis Easy API wrapper
│   │   └── tables/              ← 290+ liblouis braille tables (all languages)
│   ├── scripts/
│   │   └── setup-liblouis.js    ← copies WASM + tables from node_modules
│   └── src/
│       ├── App.tsx              ← root component (toolbar, layout)
│       ├── App.css
│       ├── components/
│       │   ├── Editor.tsx       ← Monaco Editor wrapper (500 ms debounce)
│       │   ├── PrintPanel.tsx   ← embosser print UI
│       │   └── StatusBar.tsx    ← word/char/BRF stats + progress
│       ├── hooks/
│       │   └── useBraille.ts    ← worker lifecycle + translate API
│       ├── services/
│       │   └── bridge-client.ts ← HTTP client for Go bridge
│       ├── utils/
│       │   ├── braille.ts       ← ASCII BRF → Unicode braille converter
│       │   └── tableRegistry.ts ← curated table name → filename registry
│       └── workers/
│           └── braille.worker.ts ← liblouis WASM loader + chunked translator
└── .github/workflows/
    └── Pages_Workflow.yaml  ← GitHub Actions: build + deploy to Pages
```

---

## Key Design Decisions

### Why WebAssembly / client-side only?

Server-side braille translation would require running liblouis on a server,
adding latency, cost, and a privacy concern (sending document text off-device).
By running liblouis as WASM in the browser, translation is:
- **Private** — text never leaves the device.
- **Free to deploy** — static hosting (GitHub Pages) is sufficient.
- **Offline-capable** — once the page is loaded, translation works without
  a network connection (tables are fetched once and cached by the browser).

### Why a Web Worker?

liblouis translation is CPU-bound.  Running it on the main thread would block
React rendering and make the UI unresponsive during large-document translation.
The Worker runs on a separate OS thread, so the UI stays fluid while PROGRESS
events stream in.

### Why paragraph-level chunking?

BrailleBlaster (the reference implementation by APH) translates documents node
by node in its XML/NIMAS tree — effectively paragraph by paragraph.  Grade 2
contractions are resolved within paragraphs, not across them.  Matching this
boundary means our output is semantically consistent with industry practice.

The trade-off: a word split across a chunk boundary (e.g. "them/selves") might
not receive the cross-boundary contraction.  In practice this is rare, because
chunk boundaries are always at paragraph breaks, and paragraphs virtually never
end mid-word.

### On-demand table loading

liblouis tables have a dependency graph (e.g. `en-ueb-g2.ctb` includes
`en-ueb-chardefs.uti`).  The Easy API's `enableOnDemandTableLoading` intercepts
liblouis file-system calls and fetches missing tables as HTTP requests.
This means every table in `public/tables/` is available without being
pre-loaded — the worker only downloads what it actually needs.

### Math braille (future)

See `MATH_STRATEGY.md`.  The planned approach is LaTeX → MathML via MathJax,
then MathML → Nemeth/UEB via liblouis's built-in math tables.  This feature is
in active development.
