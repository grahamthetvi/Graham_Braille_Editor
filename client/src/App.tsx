import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WordMapData } from './workers/braille.worker';
import { Editor, type EditorHandle } from './components/Editor';
import { GraphicGeneratorModal } from './components/GraphicGeneratorModal';
import { PrintPanel } from './components/PrintPanel';
import { StatusBar } from './components/StatusBar';
import { WelcomeModal } from './components/WelcomeModal';
import { StlExportDialog } from './components/StlExportDialog';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { RestoreModal } from './components/RestoreModal';
import { PerkinsViewer } from './components/PerkinsViewer';
import { BrailleCell } from './components/BrailleCell';
import { startBridgeStatusPolling } from './services/bridge-client';
import { useBraille, type MathCode } from './hooks/useBraille';
import { useAutosave } from './hooks/useAutosave';
import { useActiveInstances } from './hooks/useActiveInstances';
import { generateSessionId, markExported, discardSession, discardAllSessions, getSessionText, getRecoverableSessions, type SessionMetadata } from './services/sessionStore';
import { asciiToUnicodeBraille } from './utils/braille';
import {
  formatBrfPages,
  formatBrfForOutput,
  normalizeImportedBrf,
  defaultBrfDownloadFilename,
  defaultPrintLayoutTextFilename,
  formatPlainTextForPrintDownload,
  buildPlainTextToMatchBrailleWrap,
} from './utils/brailleFormat';
import { TABLE_GROUPS, DEFAULT_TABLE } from './utils/tableRegistry';
import { canUseWebUSB } from './utils/os';
import { VIEW_PLUS_DEFAULT_LEFT_PAD_CELLS, VIEW_PLUS_LEFT_PAD_PRESETS } from './services/embossers/ViewPlusEmbosser';
import { defaultBanaBrailleDimensionsMm } from './utils/banaBrailleDimensions';
import type { BuildBrailleStlOptions } from './utils/brailleStl';
import './App.css';

/**
 * Root application component.
 *
 * Architecture:
 *   • Monaco Editor captures text (debounced 500 ms).
 *   • Text + selected table → braille Web Worker (liblouis WASM, off-main-thread).
 *   • Worker translates in chunks for large documents, streaming PROGRESS events.
 *   • Translated BRF is paginated by page layout settings and displayed as
 *     discrete page blocks (Word-like scrolling view).
 *   • Import file loads plain text (translate) or .brf (back-translate + BRF preview).
 *   • Download button exports the formatted BRF file (CRLF + form feeds).
 *   • Export STL builds a paginated Unicode layout into binary STL (BANA midpoint spacing, mm) in a Web Worker.
 *   • PrintPanel sends BRF to the optional local Go bridge for embosser printing.
 *   • Theme toggle cycles dark → light → high-contrast, persisted to localStorage.
 *   • Page layout settings (cells, lines, paper format, ViewPlus padding) persist to localStorage.
 */

type Theme = 'dark' | 'light' | 'high-contrast';

const monacoThemeMap: Record<Theme, string> = {
  dark: 'vs-dark',
  light: 'vs',
  'high-contrast': 'hc-black',
};

const themeLabels: Record<Theme, string> = {
  dark: 'Light',
  light: 'Hi-Con',
  'high-contrast': 'Dark',
};

type PaperFormat = 'us-letter' | 'wide' | 'custom';

interface PageSettings {
  cellsPerRow: number;
  linesPerPage: number;
  showPageNumbers?: boolean;
  /** Drives ViewPlus left-padding: only applied when `us-letter` (8.5×11 layout preset). */
  paperFormat: PaperFormat;
  /** ViewPlus: extra blank cells per line when printing US Letter (see Layout panel). */
  viewPlusLeftPadCells: number;
  /**
   * Literary line starts (1-based Braille cells). Each Enter-started line is a new paragraph:
   * first physical line begins at `paragraphFirstLineStartCell`, wrapped continuations at `paragraphRunoverStartCell`.
   * Values are clamped to the row width. ViewPlus left padding adds the same offset to every line, preserving alignment.
   */
  paragraphFirstLineStartCell: number;
  paragraphRunoverStartCell: number;
}

function inferPaperFormat(cellsPerRow: number, linesPerPage: number): PaperFormat {
  if (cellsPerRow === 32 && linesPerPage === 25) return 'us-letter';
  if (cellsPerRow === 40 && linesPerPage === 25) return 'wide';
  return 'custom';
}

const MATH_CODE_STORAGE_KEY = 'graham-math-code';

function readStoredMathCode(): MathCode {
  try {
    const v = localStorage.getItem(MATH_CODE_STORAGE_KEY);
    if (v === 'ueb' || v === 'nemeth') return v;
  } catch {
    /* ignore */
  }
  return 'nemeth';
}

const DEFAULT_PAGE_SETTINGS: PageSettings = {
  cellsPerRow: 40,
  linesPerPage: 25,
  showPageNumbers: false,
  paperFormat: 'wide',
  viewPlusLeftPadCells: VIEW_PLUS_DEFAULT_LEFT_PAD_CELLS,
  paragraphFirstLineStartCell: 1,
  paragraphRunoverStartCell: 1,
};

export default function App() {
  const [hasSeenWelcome, setHasSeenWelcome] = useState(
    () => !!localStorage.getItem('graham-braille-welcome-seen')
  );
  const [showWelcome, setShowWelcome] = useState(!hasSeenWelcome);

  const [hasSeenPrivacyPolicy, setHasSeenPrivacyPolicy] = useState(
    () => !!localStorage.getItem('graham-braille-privacy-seen')
  );
  const [showGraphicsEditor, setShowGraphicsEditor] = useState(false);
  const [showStlExportDialog, setShowStlExportDialog] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(hasSeenWelcome && !hasSeenPrivacyPolicy);
  const [activeTab, setActiveTab] = useState<'file' | 'view' | 'tools' | 'help'>('file');
  const editorRef = useRef<EditorHandle>(null);

  const { isSecondaryInstance, isChecking } = useActiveInstances();
  const [sessionId] = useState(() => generateSessionId());

  function handleWelcomeClose() {
    if (!hasSeenWelcome) {
      localStorage.setItem('graham-braille-welcome-seen', '1');
      setHasSeenWelcome(true);
      if (!hasSeenPrivacyPolicy) {
        setShowPrivacyPolicy(true);
      }
    }
    setShowWelcome(false);
  }

  function handlePrivacyPolicyClose() {
    if (!hasSeenPrivacyPolicy) {
      localStorage.setItem('graham-braille-privacy-seen', '1');
      setHasSeenPrivacyPolicy(true);
    }
    setShowPrivacyPolicy(false);
  }

  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeUpdateAvailable, setBridgeUpdateAvailable] = useState(false);
  const [selectedTable, setSelectedTable] = useState(() => {
    try {
      const v = localStorage.getItem('graham-braille-selected-table');
      return v || DEFAULT_TABLE;
    } catch {
      return DEFAULT_TABLE;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('graham-braille-selected-table', selectedTable);
    } catch {
      /* ignore */
    }
  }, [selectedTable]);

  const [mathCode, setMathCode] = useState<MathCode>(() => readStoredMathCode());

  // ── Perkins Viewer ───────────────────────────────────────────────────────
  const [isPerkinsMode, setIsPerkinsMode] = useState(false);

  // ── Theme management ─────────────────────────────────────────────────────
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('graham-braille-theme') as Theme | null;
    return stored ?? 'dark';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('graham-braille-theme', theme);
  }, [theme]);

  function cycleTheme() {
    setTheme(prev =>
      prev === 'dark' ? 'light' : prev === 'light' ? 'high-contrast' : 'dark'
    );
  }

  // ── Page layout settings ─────────────────────────────────────────────────
  const [pageSettings, setPageSettings] = useState<PageSettings>(() => {
    try {
      const s = localStorage.getItem('graham-braille-page-settings');
      if (!s) return DEFAULT_PAGE_SETTINGS;
      const parsed = JSON.parse(s) as Partial<PageSettings>;
      const merged: PageSettings = { ...DEFAULT_PAGE_SETTINGS, ...parsed };
      if (!parsed.paperFormat) {
        merged.paperFormat = inferPaperFormat(merged.cellsPerRow, merged.linesPerPage);
      }
      if (typeof merged.viewPlusLeftPadCells !== 'number' || Number.isNaN(merged.viewPlusLeftPadCells)) {
        merged.viewPlusLeftPadCells = VIEW_PLUS_DEFAULT_LEFT_PAD_CELLS;
      }
      if (typeof merged.paragraphFirstLineStartCell !== 'number' || Number.isNaN(merged.paragraphFirstLineStartCell)) {
        merged.paragraphFirstLineStartCell = DEFAULT_PAGE_SETTINGS.paragraphFirstLineStartCell;
      }
      if (typeof merged.paragraphRunoverStartCell !== 'number' || Number.isNaN(merged.paragraphRunoverStartCell)) {
        merged.paragraphRunoverStartCell = DEFAULT_PAGE_SETTINGS.paragraphRunoverStartCell;
      }
      return merged;
    } catch {
      return DEFAULT_PAGE_SETTINGS;
    }
  });

  useEffect(() => {
    localStorage.setItem('graham-braille-page-settings', JSON.stringify(pageSettings));
  }, [pageSettings]);

  const [showPageSettings, setShowPageSettings] = useState(false);
  const [brailleSize, setBrailleSize] = useState<number>(() => {
    const saved = localStorage.getItem('graham-braille-display-size');
    return saved ? parseInt(saved, 10) : 20;
  });
  const [showEmptyDots, setShowEmptyDots] = useState<boolean>(() => {
    const saved = localStorage.getItem('graham-braille-show-empty-dots');
    return saved ? saved === 'true' : true;
  });
  const [inactiveDotSize, setInactiveDotSize] = useState<number>(() => {
    const saved = localStorage.getItem('graham-braille-inactive-dot-size');
    const parsed = saved ? parseFloat(saved) : 4.0;
    return Math.max(2.0, Math.min(5.0, parsed));
  });

  useEffect(() => {
    localStorage.setItem('graham-braille-display-size', String(brailleSize));
  }, [brailleSize]);

  useEffect(() => {
    localStorage.setItem('graham-braille-show-empty-dots', String(showEmptyDots));
  }, [showEmptyDots]);

  useEffect(() => {
    localStorage.setItem('graham-braille-inactive-dot-size', String(inactiveDotSize));
  }, [inactiveDotSize]);
  const [showPrint, setShowPrint] = useState(false);
  const [viewPlusPresetKey, setViewPlusPresetKey] = useState(0);

  const { translate, backTranslateBrf, translatedText, isLoading, progress, error, workerReady, wordMap } =
    useBraille();

  // ── Track input stats for the status bar ────────────────────────────────
  const [inputText, setInputText] = useState('');
  const inputTextRef = useRef(inputText);
  inputTextRef.current = inputText;
  const wordCount = inputText.trim() === '' ? 0 : inputText.trim().split(/\s+/).length;
  const charCount = inputText.length;

  // ── Bridge status polling ────────────────────────────────────────────────
  const useWebUSB = canUseWebUSB();
  useEffect(() => {
    if (useWebUSB) return; // No need to poll bridge on ChromeOS
    const stopPolling = startBridgeStatusPolling((status) => {
      setBridgeConnected(status.connected);
      setBridgeUpdateAvailable(status.updateAvailable);
    });
    return stopPolling;
  }, [useWebUSB]);

  useEffect(() => {
    try {
      localStorage.setItem(MATH_CODE_STORAGE_KEY, mathCode);
    } catch {
      /* ignore */
    }
  }, [mathCode]);

  // ── Text change handler (called by Editor with debounced value) ──────────
  const handleTextChange = useCallback((text: string) => {
    setInputText(text);
    if (text.trim()) {
      translate(text, selectedTable, mathCode);
    }
  }, [translate, selectedTable, mathCode]);

  // ── Re-translate when literary table or math code changes (not on every keystroke) ──
  useEffect(() => {
    const text = inputTextRef.current;
    if (!text.trim()) return;
    translate(text, selectedTable, mathCode);
  }, [selectedTable, mathCode, translate]);

  // ── File import (plain text or .brf) ─────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Separate state that is only set on file load or math conversion; passed as `value` to Editor
  // so Monaco's content is replaced. Kept out of inputText feedback loop.
  const [fileContent, setFileContent] = useState<string | undefined>(undefined);

  // ── Autosave ────────────────────────────────────────────────────────────
  const [drafts, setDrafts] = useState<SessionMetadata[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  useAutosave(
    sessionId,
    inputText,
    true, // always autosaving current session
    isSecondaryInstance,
    isChecking,
    (sessions) => {
      setDrafts(sessions);
    }
  );

  function handleOpenDrafts() {
    setDrafts(getRecoverableSessions());
    setShowDrafts(true);
  }

  function handleRestoreSession(id: string) {
    const text = getSessionText(id);
    if (text) {
      setInputText(text);
      setFileContent(text);
      if (text.trim()) {
        translate(text, selectedTable, mathCode);
      }
    }
  }

  function handleDiscardSessionItem(id: string) {
    discardSession(id);
    setDrafts(prev => prev.filter(s => s.id !== id));
  }

  function handleDiscardAllSessions() {
    discardAllSessions();
    setDrafts([]);
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isBrf = file.name.toLowerCase().endsWith('.brf');
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      if (isBrf) {
        const normalized = normalizeImportedBrf(raw);
        void backTranslateBrf(normalized, selectedTable)
          .then(({ plainText }) => {
            setInputText(plainText);
            setFileContent(plainText);
          })
          .catch((err: unknown) => {
            console.error('[brf import]', err);
          });
      } else {
        setInputText(raw);
        setFileContent(raw);
        translate(raw, selectedTable, mathCode);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  }

  // ── BRF download ─────────────────────────────────────────────────────────
  function handleDownloadBrf() {
    if (!translatedText) return;
    const formatted = formatBrfForOutput(
      translatedText,
      pageSettings.cellsPerRow,
      pageSettings.linesPerPage,
      pageSettings.showPageNumbers,
      {
        firstLineStartCell: pageSettings.paragraphFirstLineStartCell,
        runoverStartCell: pageSettings.paragraphRunoverStartCell,
      },
    );
    // CRLF + form feeds (0x0C) between pages — embosser-friendly; ASCII-only payload.
    const blob = new Blob([formatted], { type: 'text/plain;charset=us-ascii' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultBrfDownloadFilename();
    a.click();
    URL.revokeObjectURL(url);
    markExported(sessionId);
  }

  function handleDownloadPrintLayoutText() {
    if (!inputText.trim()) return;
    
    let alignedText = inputText;
    // Align with Braille wrapping formatting if translation is available
    if (workerReady && translatedText) {
      alignedText = buildPlainTextToMatchBrailleWrap(
        inputText,
        translatedText,
        pageSettings.cellsPerRow,
        paragraphStarts,
      );
    }
    
    const body = formatPlainTextForPrintDownload(alignedText);
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultPrintLayoutTextFilename();
    a.click();
    URL.revokeObjectURL(url);
    markExported(sessionId);
  }

  // ── Paginated braille output ─────────────────────────────────────────────
  const unicodeBraille = translatedText ? asciiToUnicodeBraille(translatedText) : '';
  const paragraphStarts = useMemo(
    () => ({
      firstLineStartCell: pageSettings.paragraphFirstLineStartCell,
      runoverStartCell: pageSettings.paragraphRunoverStartCell,
    }),
    [pageSettings.paragraphFirstLineStartCell, pageSettings.paragraphRunoverStartCell],
  );

  // The editor normally wraps purely visually (using Monaco's native wordWrapColumn).
  // The destructive 'buildPlainTextToMatchBrailleWrap' algorithm is reserved 
  // exclusively for 'Download print layout' above.

  const brfPages = unicodeBraille
    ? formatBrfPages(
        unicodeBraille,
        pageSettings.cellsPerRow,
        pageSettings.linesPerPage,
        pageSettings.showPageNumbers,
        paragraphStarts,
      )
    : [];

  const formattedBrfForPrint = useMemo(() => {
    if (!translatedText) return '';
    return formatBrfForOutput(
      translatedText,
      pageSettings.cellsPerRow,
      pageSettings.linesPerPage,
      pageSettings.showPageNumbers,
      paragraphStarts,
    );
  }, [
    translatedText,
    pageSettings.cellsPerRow,
    pageSettings.linesPerPage,
    pageSettings.showPageNumbers,
    paragraphStarts,
  ]);

  const stlBuildBase = useMemo(
    (): Omit<BuildBrailleStlOptions, 'unicodeLines'> => ({
      dimensions: defaultBanaBrailleDimensionsMm(),
      plateThicknessMm: 2,
      plateBorderMm: 2,
      cylinderSegments: 12,
    }),
    [],
  );

  // ── Scroll & Highlight Sync ──────────────────────────────────────────────
  const brfContainerRef = useRef<HTMLDivElement>(null);
  const [editorScrollPercentage, setEditorScrollPercentage] = useState<number | undefined>(undefined);
  const [activeWordRange, setActiveWordRange] = useState<[number, number] | null>(null);
  const [syncHighlight, setSyncHighlight] = useState(true);

  const activeBrfWordRange = useMemo((): [number, number] | null => {
    if (!syncHighlight || !activeWordRange) return null;
    if (!wordMap || wordMap.srcToBrf.length === 0) return activeWordRange;
    const [srcStart, srcEnd] = activeWordRange;
    const { srcToBrf, srcToBrfEnd } = wordMap as WordMapData;
    if (srcStart >= srcToBrf.length || srcEnd >= srcToBrfEnd.length) return null;
    return [srcToBrf[srcStart], srcToBrfEnd[srcEnd]];
  }, [syncHighlight, activeWordRange, wordMap]);

  const handleEditorScroll = useCallback((percentage: number) => {
    const container = brfContainerRef.current;
    if (!container) return;
    
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScroll > 0) {
      const targetScrollTop = percentage * maxScroll;
      if (Math.abs(container.scrollTop - targetScrollTop) > 1) {
        container.scrollTop = targetScrollTop;
      }
    }
  }, []);

  const handleBrfScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScroll > 0) {
      const percentage = Math.max(0, Math.min(container.scrollTop, maxScroll)) / maxScroll;
      setEditorScrollPercentage(percentage);
    }
  }, []);

  // ── Page settings input handlers ─────────────────────────────────────────
  function handleCellsChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 10 && v <= 100) {
      setPageSettings(s => ({
        ...s,
        cellsPerRow: v,
        paperFormat: inferPaperFormat(v, s.linesPerPage),
      }));
    }
  }

  function handleLinesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 5 && v <= 50) {
      setPageSettings(s => ({
        ...s,
        linesPerPage: v,
        paperFormat: inferPaperFormat(s.cellsPerRow, v),
      }));
    }
  }

  function handleViewPlusPadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= -80 && v <= 80) {
      setPageSettings(s => ({ ...s, viewPlusLeftPadCells: v }));
    }
  }

  let globalWordIndex = 0;

  return (
    <div className="app-layout">
      {/* Skip navigation link for keyboard and screen reader users */}
      <a className="skip-link" href="#main-content">Skip to main content</a>

      {/* ── Header toolbar ───────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-title">
          <h1>Graham Braille Editor</h1>
          <span className="subtitle">Braille Editing &amp; Embossing Suite</span>
        </div>

        <div className="toolbar-container">
          <div className="tab-list" role="tablist">
            <button 
              className={`tab-btn${activeTab === 'file' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('file')}
              role="tab"
              aria-selected={activeTab === 'file'}
            >
              File
            </button>
            <button 
              className={`tab-btn${activeTab === 'view' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('view')}
              role="tab"
              aria-selected={activeTab === 'view'}
            >
              View & Layout
            </button>
            <button 
              className={`tab-btn${activeTab === 'tools' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('tools')}
              role="tab"
              aria-selected={activeTab === 'tools'}
            >
              Tools
            </button>
            <button 
              className={`tab-btn${activeTab === 'help' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('help')}
              role="tab"
              aria-selected={activeTab === 'help'}
            >
              Help & Support
            </button>
          </div>

          <div className="tab-content" role="tabpanel">
            {activeTab === 'file' && (
              <div className="toolbar">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.text,.md,.rst,.adoc,.brf,text/plain"
                  aria-hidden="true"
                  tabIndex={-1}
                  style={{ display: 'none' }}
                  onChange={handleFileImport}
                  disabled={isPerkinsMode}
                />
                <button
                  className="toolbar-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPerkinsMode}
                  title="Plain text: translate to braille. .brf: back-translate to text (selected table) and show BRF on the right. Grade 2 back-translation is approximate; retry after liblouis loads if needed."
                  aria-label="Import text or BRF file"
                >
                  Import file
                </button>

                <button
                  className="toolbar-btn"
                  onClick={handleOpenDrafts}
                  disabled={isPerkinsMode}
                  title="View unsaved drafts from the last 30 days"
                  aria-label="View drafts"
                >
                  Drafts {drafts.length > 0 && `(${drafts.length})`}
                </button>

                <button
                  className="toolbar-btn toolbar-btn--primary"
                  onClick={handleDownloadBrf}
                  disabled={!translatedText || isPerkinsMode}
                  title="Download BRF with Layout settings: cells per row, lines per page, paragraph line starts, optional page numbers, CRLF lines, form feed between pages"
                  aria-label="Download translated BRF file"
                >
                  Download BRF
                </button>

                <button
                  className="toolbar-btn"
                  onClick={handleDownloadPrintLayoutText}
                  disabled={!inputText.trim() || isPerkinsMode}
                  title="Download plain text (.txt) with the same line breaks as the text editor—each line matches a braille row so you can print or open in Word and align with the embossed layout."
                  aria-label="Download print layout text file"
                >
                  Download print layout
                </button>

                <button
                  className="toolbar-btn"
                  onClick={() => setShowStlExportDialog(true)}
                  disabled={!translatedText || isPerkinsMode}
                  title="Export the paginated Braille preview as a 3D STL (BANA midpoint dot spacing, millimeters) for 3D printing."
                  aria-label="Export Braille layout as STL for 3D printing"
                >
                  Export STL
                </button>

                <button
                  className={`toolbar-btn${showPrint ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowPrint(s => !s)}
                  disabled={isPerkinsMode}
                  aria-expanded={showPrint}
                  title="Toggle Print to Embosser panel"
                >
                  🖨 Print
                </button>
              </div>
            )}

            {activeTab === 'view' && (
              <div className="toolbar">
                <button
                  className={`toolbar-btn${showPageSettings ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowPageSettings(s => !s)}
                  aria-expanded={showPageSettings}
                  aria-controls="page-settings-panel"
                  title="Configure page layout (cells per row, lines per page)"
                >
                  ⚙ Layout Settings
                </button>

                <button
                  className={`toolbar-btn${isPerkinsMode ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setIsPerkinsMode(s => !s)}
                  aria-expanded={isPerkinsMode}
                  title="Toggle Perkins Brailler Translator layout"
                >
                  🎹 Perkins Viewer
                </button>

                <button
                  className={`toolbar-btn${syncHighlight ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setSyncHighlight(s => !s)}
                  disabled={isPerkinsMode}
                  title="Highlight corresponding braille words when selecting text in the editor."
                  aria-label="Toggle braille highlight sync"
                >
                  Sync Highlight
                </button>

                <button
                  className="theme-toggle"
                  onClick={cycleTheme}
                  aria-label={`Switch theme (current: ${theme}). Click to switch to ${themeLabels[theme]} theme.`}
                  title="Cycle theme: dark → light → high contrast"
                >
                  {themeLabels[theme]}
                </button>
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="toolbar">
                <label className="toolbar-label" htmlFor="table-select">
                  Table
                </label>
                <select
                  id="table-select"
                  className="table-select"
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  disabled={isPerkinsMode}
                  title="Select a liblouis braille translation table"
                  aria-label="Select braille translation table"
                >
                  {TABLE_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.tables.map((t) => (
                        <option key={t.file} value={t.file}>
                          {t.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <button
                  className={`toolbar-btn${showGraphicsEditor ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowGraphicsEditor(s => !s)}
                  disabled={isPerkinsMode}
                  title="Open the Tactile Graphics Editor"
                  aria-label="Tactile Graphics Editor"
                >
                  Graphics
                </button>

                <span className="toolbar-label" style={{ margin: '0 0.5rem' }}>
                  UEB Math is standard and $$math$$ is Nemeth.
                </span>
                <button
                  className="toolbar-btn"
                  id="ai-prompt-btn"
                  onClick={() => {
                    const promptText = "Extract raw text for the purpose of braille translation. Please reformat my text so that every mathematical expression, equation, and arithmetic operation is wrapped in LaTeX notation: \\(...\\) for inline math and $$...$$ for display equations. Leave all non-math prose unchanged.";
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(promptText);
                    } else {
                      const textArea = document.createElement("textarea");
                      textArea.value = promptText;
                      document.body.appendChild(textArea);
                      textArea.focus();
                      textArea.select();
                      try {
                        document.execCommand('copy');
                      } catch (err) {
                        console.error('Fallback format copy failed', err);
                      }
                      document.body.removeChild(textArea);
                    }
                    const btn = document.getElementById('ai-prompt-btn');
                    if (btn) {
                      const originalText = btn.innerText;
                      btn.innerText = "Copied!";
                      setTimeout(() => { btn.innerText = originalText; }, 2000);
                    }
                  }}
                  title="Copy prompt for AI to format math"
                  aria-label="Copy prompt for AI to format math"
                >
                  Copy AI Prompt
                </button>
              </div>
            )}

            {activeTab === 'help' && (
              <div className="toolbar">
                <button
                  className="toolbar-btn guide-btn"
                  onClick={() => setShowWelcome(true)}
                  aria-label="Open User Guide"
                  title="Open the User Guide"
                >
                  User Guide
                </button>

                <button
                  className="toolbar-btn guide-btn"
                  onClick={() => setShowPrivacyPolicy(true)}
                  aria-label="Open Privacy Policy"
                  title="Open the Privacy Policy"
                >
                  Privacy Policy
                </button>

                <a
                  href="https://buymeacoffee.com/grahamthetvi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="toolbar-btn tip-me-btn"
                  title="Support Graham Braille Editor"
                  aria-label="Tip me on Buy Me a Coffee"
                >
                  ☕ Tip Me
                </a>

                <span className="toolbar-version" style={{ marginLeft: 'auto', alignSelf: 'center', paddingRight: '1rem', fontSize: '0.8rem', opacity: 0.6 }}>
                  Build: {import.meta.env.VITE_GITHUB_BUILD_NUMBER || 'dev'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Compact print bar — full-width row below the toolbar */}
        {showPrint && (
          <div className="header-print-bar">
            <PrintPanel
              brf={formattedBrfForPrint || translatedText}
              bridgeConnected={bridgeConnected}
              useWebUSB={useWebUSB}
              compact
              viewPlusLeftPadCells={pageSettings.viewPlusLeftPadCells}
              onViewPlusLeftPadCellsChange={cells => setPageSettings(s => ({ ...s, viewPlusLeftPadCells: cells }))}
              viewPlusPaddingApplies={pageSettings.paperFormat === 'us-letter'}
              onExport={() => markExported(sessionId)}
            />
          </div>
        )}
      </header>

      {/* ── Main two-pane layout ─────────────────────────────────────────── */}
      <main id="main-content" className="app-main">
        {/* Left pane: text editor */}
        <section className="editor-pane" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="pane-title">
            Text Input
          </div>
          
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Editor
              ref={editorRef}
              onTextChange={handleTextChange}
              monacoTheme={monacoThemeMap[theme]}
              value={fileContent}
              cellsPerRow={pageSettings.cellsPerRow}
              onScrollPercentageChange={handleEditorScroll}
              scrollPercentage={editorScrollPercentage}
              onSelectionChange={setActiveWordRange}
            />
          </div>
        </section>

        {/* Right pane: braille preview + print panel */}
        <aside className="side-pane">
          {isPerkinsMode ? (
            <PerkinsViewer rawText={inputText} />
          ) : (
            <section
              className="brf-preview"
              aria-label="Braille preview output"
              aria-live="polite"
            >
              {/* Pane title row with settings toggle */}
              <div className="pane-title-row">
                <div className="pane-title">
                  BRF Preview
                  {isLoading && translatedText && (
                    <span className="preview-loading"> — translating…</span>
                  )}
                </div>
              </div>

              {/* Page layout settings panel */}
              {showPageSettings && (
                <div id="page-settings-panel" className="page-settings-panel">
                  <div className="layout-presets" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button
                      type="button"
                      className={`toolbar-btn ${pageSettings.paperFormat === 'us-letter' ? 'toolbar-btn--active' : ''}`}
                      onClick={() =>
                        setPageSettings(s => ({
                          ...s,
                          cellsPerRow: 32,
                          linesPerPage: 25,
                          paperFormat: 'us-letter',
                        }))
                      }
                      title="Standard 8.5×11 inch paper (US Letter)"
                    >
                      8.5×11in
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn ${pageSettings.paperFormat === 'wide' ? 'toolbar-btn--active' : ''}`}
                      onClick={() =>
                        setPageSettings(s => ({
                          ...s,
                          cellsPerRow: 40,
                          linesPerPage: 25,
                          paperFormat: 'wide',
                        }))
                      }
                      title="Wide 11×11.5 inch tractor feed paper"
                    >
                      11×11.5in
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn ${pageSettings.paperFormat === 'custom' ? 'toolbar-btn--active' : ''}`}
                      style={{ cursor: 'default' }}
                      title="Custom dimensions (set cells and lines below)"
                    >
                      Custom
                    </button>
                  </div>
                  <label className="settings-field">
                    <span>Cells / row</span>
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={pageSettings.cellsPerRow}
                      onChange={handleCellsChange}
                      aria-label="Braille cells per row"
                    />
                  </label>
                  <label className="settings-field">
                    <span>Lines / page</span>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={pageSettings.linesPerPage}
                      onChange={handleLinesChange}
                      aria-label="Lines per page"
                    />
                  </label>
                  <label className="settings-field">
                    <input
                      type="checkbox"
                      checked={pageSettings.showPageNumbers || false}
                      onChange={(e) => setPageSettings(s => ({ ...s, showPageNumbers: e.target.checked }))}
                      aria-label="Show Page Numbers"
                    />
                    <span>Show Page Nums</span>
                  </label>

                  <div
                    className="paragraph-format-block"
                    role="group"
                    aria-label="Paragraph line start positions"
                  >
                    <div className="paragraph-format-heading">Paragraph line starts (1–5)</div>
                    <p className="settings-hint paragraph-format-note">
                      Each new line from Enter is a paragraph: pick which <strong>cell</strong> the first line begins on and
                      which cell <strong>runover</strong> lines use (e.g. literary <strong>3–5</strong>). ViewPlus left padding
                      adds the same blank cells to <em>every</em> line, so these positions stay aligned on the page.
                    </p>
                    <div className="paragraph-matrix">
                      <div className="paragraph-matrix-corner" aria-hidden="true" />
                      {[1, 2, 3, 4, 5].map((run) => (
                        <div key={`col-${run}`} className="paragraph-matrix-colhead">
                          {run}
                        </div>
                      ))}
                      {[1, 2, 3, 4, 5].map((first) => (
                        <Fragment key={`row-${first}`}>
                          <div className="paragraph-matrix-rowhead">First {first}</div>
                          {[1, 2, 3, 4, 5].map((run) => {
                            const active =
                              pageSettings.paragraphFirstLineStartCell === first &&
                              pageSettings.paragraphRunoverStartCell === run;
                            return (
                              <button
                                key={`${first}-${run}`}
                                type="button"
                                className={`paragraph-matrix-cell${active ? ' paragraph-matrix-cell--active' : ''}`}
                                aria-label={`First line cell ${first}, runover cell ${run}`}
                                aria-pressed={active}
                                onClick={() =>
                                  setPageSettings((s) => ({
                                    ...s,
                                    paragraphFirstLineStartCell: first,
                                    paragraphRunoverStartCell: run,
                                  }))
                                }
                              >
                                {first}-{run}
                              </button>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                    <div className="paragraph-format-quick">
                      <span className="paragraph-format-quick-label">Quick:</span>
                      <button
                        type="button"
                        className="toolbar-btn"
                        onClick={() =>
                          setPageSettings((s) => ({
                            ...s,
                            paragraphFirstLineStartCell: 1,
                            paragraphRunoverStartCell: 1,
                          }))
                        }
                      >
                        1–1 (flush)
                      </button>
                      <button
                        type="button"
                        className="toolbar-btn"
                        onClick={() =>
                          setPageSettings((s) => ({
                            ...s,
                            paragraphFirstLineStartCell: 3,
                            paragraphRunoverStartCell: 5,
                          }))
                        }
                      >
                        3–5 (literary)
                      </button>
                    </div>
                  </div>

                  <p className="settings-hint">
                    Common: 32 × 25 (8.5×11), 40 × 25 (11×11.5)
                  </p>

                  <div className="viewplus-layout-block" role="group" aria-label="Embosser edge padding">
                    <div className="viewplus-layout-heading">Embosser edge padding</div>
                    <p className="viewplus-layout-note">
                      If your embosser feeds sheets offset and loses characters on the left edge, we can add optional{' '}
                      <strong>left padding</strong> (blank cells) on each line. This applies to <strong>any embosser</strong> and paper size. If you
                      find a setting that works well for your setup, email{' '}
                      <a href="mailto:grahamthetvi@icloud.com">grahamthetvi@icloud.com</a> so we can add it to the presets.
                    </p>
                    <label className="settings-field">
                      <span>Left padding (cells)</span>
                      <input
                        type="number"
                        min={-80}
                        max={80}
                        value={pageSettings.viewPlusLeftPadCells}
                        onChange={handleViewPlusPadChange}
                        aria-label="Left padding in braille cells"
                      />
                    </label>
                    <p className="settings-hint viewplus-padding-hint">
                      Padding is <strong>applied</strong> to all print jobs.
                    </p>
                    <label className="settings-field">
                      <span>Quick preset</span>
                      <select
                        key={viewPlusPresetKey}
                        className="viewplus-preset-select"
                        aria-label="ViewPlus padding preset"
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'max') {
                            setPageSettings(s => ({ ...s, viewPlusLeftPadCells: VIEW_PLUS_LEFT_PAD_PRESETS.max }));
                          } else if (v === 'rogue') {
                            setPageSettings(s => ({ ...s, viewPlusLeftPadCells: VIEW_PLUS_LEFT_PAD_PRESETS.rogue }));
                          } else if (v === 'premier') {
                            setPageSettings(s => ({ ...s, viewPlusLeftPadCells: VIEW_PLUS_LEFT_PAD_PRESETS.premier }));
                          } else if (v === 'embraille') {
                            setPageSettings(s => ({ ...s, viewPlusLeftPadCells: VIEW_PLUS_LEFT_PAD_PRESETS.embraille }));
                          } else if (v === 'none') {
                            setPageSettings(s => ({ ...s, viewPlusLeftPadCells: VIEW_PLUS_LEFT_PAD_PRESETS.none }));
                          }
                          if (v) setViewPlusPresetKey(k => k + 1);
                        }}
                      >
                        <option value="">Apply model preset…</option>
                        <option value="none">None (0)</option>
                        <option value="max">ViewPlus Max (15)</option>
                        <option value="rogue">ViewPlus Rogue (0)</option>
                        <option value="premier">ViewPlus Premier (0)</option>
                        <option value="embraille">ViewPlus EmBraille (0)</option>
                      </select>
                    </label>
                  </div>

                  <div className="display-settings-block" role="group" aria-label="Braille display settings">
                    <div className="display-settings-heading">Braille Display Settings</div>
                    <label className="settings-field">
                      <span>Display size</span>
                      <input
                        type="range"
                        min={14}
                        max={36}
                        value={brailleSize}
                        onChange={(e) => setBrailleSize(parseInt(e.target.value, 10))}
                        aria-label="Braille display cell size slider"
                      />
                      <span className="settings-value-label">{brailleSize}px</span>
                    </label>
                    <label className="settings-field">
                      <input
                        type="checkbox"
                        checked={showEmptyDots}
                        onChange={(e) => setShowEmptyDots(e.target.checked)}
                        aria-label="Show empty dots in braille cells"
                      />
                      <span>Show empty dots</span>
                    </label>
                    {showEmptyDots && (
                      <label className="settings-field">
                        <span>Empty dot size</span>
                        <input
                          type="range"
                          min={2.0}
                          max={5.0}
                          step={0.1}
                          value={inactiveDotSize}
                          onChange={(e) => setInactiveDotSize(parseFloat(e.target.value))}
                          aria-label="Braille display empty dot size slider"
                        />
                        <span className="settings-value-label">{inactiveDotSize.toFixed(1)}px</span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Progress bar for chunked large-document translation */}
              {isLoading && progress > 0 && progress < 100 && (
                <div
                  className="progress-bar-wrap"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Translation progress"
                >
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                  <span className="progress-label">{progress}%</span>
                </div>
              )}

              {error && (
                <p className="translation-error" role="alert">
                  Translation error: {error}
                </p>
              )}

              {/* Paginated Word-like braille output */}
              {brfPages.length > 0 ? (
                <div 
                  className="brf-pages-container" 
                  aria-label="Braille pages"
                  ref={brfContainerRef}
                  onScroll={handleBrfScroll}
                  style={{
                    '--braille-cell-height': `${brailleSize}px`,
                    '--braille-cell-width': `${brailleSize * 0.64}px`,
                    '--braille-cell-gap': `${brailleSize * 0.4}px`,
                    '--braille-dot-size-active': `${brailleSize * 0.22}px`,
                    '--braille-dot-size-inactive': `${inactiveDotSize}px`,
                    '--braille-cell-height-8dot': `${brailleSize * 1.33}px`,
                    '--braille-line-gap': `${brailleSize * 0.5}px`,
                  } as React.CSSProperties}
                >
                  {brfPages.map((pageContent, i) => {
                    const lines = pageContent.split('\n');
                    return (
                      <div
                        key={i}
                        className="brf-page"
                        aria-label={`Braille page ${i + 1} of ${brfPages.length}`}
                      >
                        <div className="brf-page-number" aria-hidden="true">
                          p. {i + 1}
                        </div>
                        <div className="brf-page-content">
                          {lines.map((line, lineIdx) => {
                            // Jumbo / large-print line: `\u0002<sizePx>\u0002<text>` — render as big print.
                            if (line.startsWith('\u0002')) {
                              const rest = line.slice(1);
                              const sep = rest.indexOf('\u0002');
                              const sizeStr = sep >= 0 ? rest.slice(0, sep) : '';
                              const text = sep >= 0 ? rest.slice(sep + 1) : rest;
                              const size = Math.min(400, Math.max(8, parseInt(sizeStr, 10) || 48));
                              
                              const jumboStyles = {
                                fontSize: `${size}px`,
                                '--braille-cell-height': `${size}px`,
                                '--braille-cell-width': `${size * 0.64}px`,
                                '--braille-cell-gap': `${size * 0.4}px`,
                                '--braille-dot-size-active': `${size * 0.22}px`,
                                '--braille-dot-size-inactive': `${size * 0.22 * (inactiveDotSize / Math.max(1, brailleSize * 0.22))}px`,
                                '--braille-cell-height-8dot': `${size * 1.33}px`,
                                '--braille-line-gap': `${size * 0.5}px`,
                              } as React.CSSProperties;

                              return (
                                <div
                                  key={lineIdx}
                                  className="brf-jumbo-line"
                                  style={jumboStyles}
                                >
                                  {text.length > 0 ? (
                                    text.split('').map((char, charIdx) => (
                                      <BrailleCell
                                        key={charIdx}
                                        char={char}
                                        showEmptyDots={showEmptyDots}
                                      />
                                    ))
                                  ) : (
                                    '\u00a0'
                                  )}
                                </div>
                              );
                            }
                            const tokens = line.split(/([\s\u2800]+)/);
                            return (
                              <div key={lineIdx} className="brf-page-line">
                                {tokens.map((token, tokenIdx) => {
                                  if (!token) return null;
                                  
                                  if (/^[\s\u2800]+$/.test(token)) {
                                    return token.split('').map((char, charIdx) => (
                                      <BrailleCell
                                        key={`${tokenIdx}-${charIdx}`}
                                        char={char}
                                        showEmptyDots={showEmptyDots}
                                      />
                                    ));
                                  }
                                  
                                  const currentWordIndex = globalWordIndex++;
                                  const isActive = activeBrfWordRange != null &&
                                    currentWordIndex >= activeBrfWordRange[0] &&
                                    currentWordIndex <= activeBrfWordRange[1];
                                    
                                  const wordCells = token.split('').map((char, charIdx) => (
                                    <BrailleCell
                                      key={charIdx}
                                      char={char}
                                      showEmptyDots={showEmptyDots}
                                    />
                                  ));
                                  
                                  return isActive ? (
                                    <span key={`w${tokenIdx}`} className="braille-highlight">
                                      {wordCells}
                                    </span>
                                  ) : (
                                    <Fragment key={`w${tokenIdx}`}>{wordCells}</Fragment>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="brf-placeholder" aria-live="polite">
                  {workerReady
                    ? 'Type in the editor or open a file to see braille output.'
                    : 'Loading liblouis WASM…'}
                </p>
              )}
            </section>
          )}

        </aside>
      </main>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <StatusBar
        bridgeConnected={bridgeConnected}
        bridgeUpdateAvailable={bridgeUpdateAvailable}
        useWebUSB={useWebUSB}
        brfLength={translatedText.length}
        wordCount={wordCount}
        charCount={charCount}
        isLoading={isLoading}
        progress={progress}
      />

      {/* ── Graphic Generator Modal ──────────────────────────────────────────── */}
      {showGraphicsEditor && (
        <GraphicGeneratorModal
          mathCode={mathCode}
          onMathCodeChange={setMathCode}
          onInsert={(brf) => {
            editorRef.current?.insertTextAtCursor(brf);
            setShowGraphicsEditor(false);
          }}
          onClose={() => setShowGraphicsEditor(false)}
        />
      )}

      {/* ── First-visit welcome / onboarding modal ────────────────────── */}
      {showWelcome && <WelcomeModal onClose={handleWelcomeClose} isFirstVisit={!hasSeenWelcome} />}
      {showPrivacyPolicy && <PrivacyPolicyModal onClose={handlePrivacyPolicyClose} />}

      {showStlExportDialog && (
        <StlExportDialog
          onClose={() => setShowStlExportDialog(false)}
          pageCount={brfPages.length}
          unicodePages={brfPages}
          buildBase={stlBuildBase}
          disabled={!translatedText || isPerkinsMode}
          printText={inputText}
        />
      )}

      {/* ── Drafts Modal ───────────────────────────────────────── */}
      {showDrafts && !isChecking && (
        <RestoreModal
          sessions={drafts}
          onRestore={handleRestoreSession}
          onDiscardItem={handleDiscardSessionItem}
          onDiscardAll={handleDiscardAllSessions}
          onClose={() => setShowDrafts(false)}
        />
      )}
    </div>
  );
}
