import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WordMapData } from './workers/braille.worker';
import { changeUiLocale } from './i18n';
import {
  UI_LOCALES,
  type UiLocaleId,
  readStoredUiLocale,
  readStoredAutoPairTable,
  defaultTableForLocale,
  UI_LOCALE_STORAGE_KEY,
  AUTO_PAIR_TABLE_STORAGE_KEY,
  applyDocumentLocale,
} from './i18n/locales';
import { Editor, type EditorHandle } from './components/Editor';
import { GraphicGeneratorModal } from './components/GraphicGeneratorModal';
import { PrintPanel } from './components/PrintPanel';
import { ExportPanel } from './components/ExportPanel';
import { AudioExportDialog } from './components/AudioExportDialog';
import { StatusBar } from './components/StatusBar';
import { WelcomeModal } from './components/WelcomeModal';
import { StlExportDialog } from './components/StlExportDialog';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { RestoreModal } from './components/RestoreModal';
import { PerkinsViewer } from './components/PerkinsViewer';
import { BrailleCell } from './components/BrailleCell';
import { AlphabetGeneratorModal } from './components/AlphabetGeneratorModal';
import { MusicBrailleGuideModal } from './components/MusicBrailleGuideModal';
import { GradingPrintLayoutDialog } from './components/GradingPrintLayoutDialog';
import { startBridgeStatusPolling } from './services/bridge-client';
import {
  synthesizeMp3InBrowser,
  TTS_ENGINE_STORAGE_KEY,
  DEFAULT_TTS_ENGINE,
  TtsExportError,
  isTtsEngineId,
  type TtsEngineId,
} from './services/tts';
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
  defaultGradingPrintLayoutFilename,
  defaultMp3DownloadFilename,
  formatPlainTextForPrintDownload,
  buildPlainTextToMatchBrailleWrap,
  convertToRtf,
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
 *   • Export expands a bar (like Print) for BRF, print layout, and MP3 audio.
 *   • MP3 synthesizes speech in the browser (Kitten default; eSpeak NG / Piper optional).
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

/** Maps the current theme to the i18n key for the label of the *next* theme (what cycling shows). */
const nextThemeLabelKey: Record<Theme, string> = {
  dark: 'app.view.theme.labels.light',
  light: 'app.view.theme.labels.highContrast',
  'high-contrast': 'app.view.theme.labels.dark',
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
  const { t } = useTranslation();
  const [hasSeenWelcome, setHasSeenWelcome] = useState(
    () => !!localStorage.getItem('graham-braille-welcome-seen')
  );
  const [showWelcome, setShowWelcome] = useState(!hasSeenWelcome);

  const [hasSeenPrivacyPolicy, setHasSeenPrivacyPolicy] = useState(
    () => !!localStorage.getItem('graham-braille-privacy-seen')
  );
  const [showGraphicsEditor, setShowGraphicsEditor] = useState(false);
  const [showAlphabetGenerator, setShowAlphabetGenerator] = useState(false);
  const [showMusicBrailleGuide, setShowMusicBrailleGuide] = useState(false);
  const [showStlExportDialog, setShowStlExportDialog] = useState(false);
  const [showGradingPrintLayoutDialog, setShowGradingPrintLayoutDialog] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(hasSeenWelcome && !hasSeenPrivacyPolicy);
  const [activeTab, setActiveTab] = useState<'file' | 'view' | 'languages-codes' | 'tools' | 'help'>('file');
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
  const [ttsEngine, setTtsEngine] = useState<TtsEngineId>(() => {
    try {
      const v = localStorage.getItem(TTS_ENGINE_STORAGE_KEY);
      return v && isTtsEngineId(v) ? v : DEFAULT_TTS_ENGINE;
    } catch {
      return DEFAULT_TTS_ENGINE;
    }
  });
  const [mp3Exporting, setMp3Exporting] = useState(false);
  const [mp3ExportStatus, setMp3ExportStatus] = useState<string | null>(null);
  const [mp3ExportError, setMp3ExportError] = useState<string | null>(null);
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

  // ── UI locale & table auto-pairing ───────────────────────────────────────
  const [uiLocale, setUiLocale] = useState<UiLocaleId>(() => readStoredUiLocale());
  const [autoPairTable, setAutoPairTable] = useState<boolean>(() => readStoredAutoPairTable());

  useEffect(() => {
    try {
      localStorage.setItem(UI_LOCALE_STORAGE_KEY, uiLocale);
    } catch {
      /* ignore */
    }
    void changeUiLocale(uiLocale);
    applyDocumentLocale(uiLocale);
  }, [uiLocale]);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_PAIR_TABLE_STORAGE_KEY, String(autoPairTable));
    } catch {
      /* ignore */
    }
  }, [autoPairTable]);

  function handleLanguageChange(id: UiLocaleId) {
    setUiLocale(id);
    if (autoPairTable) {
      setSelectedTable(defaultTableForLocale(id));
    }
  }

  function handleAutoPairToggle() {
    setAutoPairTable(prev => {
      const next = !prev;
      if (next) {
        setSelectedTable(defaultTableForLocale(uiLocale));
      }
      return next;
    });
  }

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

  const [gradingSheetOnAllPages, setGradingSheetOnAllPages] = useState<boolean>(() => {
    try {
      return localStorage.getItem('graham-braille-grading-all-pages') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('graham-braille-grading-all-pages', gradingSheetOnAllPages ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [gradingSheetOnAllPages]);

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
  const [showExport, setShowExport] = useState(false);
  const [showAudioExport, setShowAudioExport] = useState(false);
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
    getRecoverableSessions().then(sessions => {
      setDrafts(sessions);
      setShowDrafts(true);
    }).catch(err => {
      console.error('Failed to open drafts', err);
    });
  }

  function handleRestoreSession(id: string) {
    getSessionText(id).then(text => {
      if (text) {
        setInputText(text);
        setFileContent(text);
        if (text.trim()) {
          translate(text, selectedTable, mathCode);
        }
      }
    }).catch(err => {
      console.error('Failed to restore session', err);
    });
  }

  function handleDiscardSessionItem(id: string) {
    discardSession(id).then(() => {
      setDrafts(prev => prev.filter(s => s.id !== id));
    }).catch(err => {
      console.error('Failed to discard session', err);
    });
  }

  function handleDiscardAllSessions() {
    discardAllSessions().then(() => {
      setDrafts([]);
    }).catch(err => {
      console.error('Failed to discard all sessions', err);
    });
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
    markExported(sessionId).catch(err => {
      console.error('Failed to mark session as exported', err);
    });
  }

  async function handleDownloadMp3() {
    const text = inputText.trim();
    if (!text || mp3Exporting) return;
    setMp3ExportError(null);
    setMp3ExportStatus(t('app.file.downloadMp3.status.starting'));
    setMp3Exporting(true);
    try {
      const blob = await synthesizeMp3InBrowser(inputText, ttsEngine, progress => {
        setMp3ExportStatus(t(progress.messageKey, progress.messageParams));
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultMp3DownloadFilename();
      a.click();
      URL.revokeObjectURL(url);
      markExported(sessionId).catch(err => {
        console.error('Failed to mark session as exported', err);
      });
      setMp3ExportStatus(null);
      setShowAudioExport(false);
    } catch (err) {
      const msg =
        err instanceof TtsExportError
          ? t(err.i18nKey, err.i18nParams)
          : err instanceof Error
            ? err.message
            : String(err);
      setMp3ExportError(msg);
      setMp3ExportStatus(null);
      console.error('MP3 export failed', err);
    } finally {
      setMp3Exporting(false);
    }
  }

  function handleTtsEngineChange(engine: TtsEngineId) {
    setTtsEngine(engine);
    try {
      localStorage.setItem(TTS_ENGINE_STORAGE_KEY, engine);
    } catch {
      /* ignore */
    }
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
    const rtfContent = convertToRtf(body);
    const blob = new Blob([rtfContent], { type: 'application/rtf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultPrintLayoutTextFilename();
    a.click();
    URL.revokeObjectURL(url);
    markExported(sessionId).catch(err => {
      console.error('Failed to mark session as exported', err);
    });
  }

  function handleDownloadGradingPrintLayoutText() {
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
    const gradingHeader = `================================================================
GRADING SHEET
================================================================
Word Count: ${wordCount}
Character Count: ${charCount}

Date: _________________
WPM:  _________________ (number of words/total seconds*60)
LPM:  _________________ (number of letters/total seconds*60)
Accuracy: _____________ %
================================================================

`;
    
    let fullContent = '';
    if (gradingSheetOnAllPages) {
      const pages = body.split('\f');
      fullContent = pages.map(page => gradingHeader + page).join('\f');
    } else {
      fullContent = gradingHeader + body;
    }

    const rtfContent = convertToRtf(fullContent);
    const blob = new Blob([rtfContent], { type: 'application/rtf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultGradingPrintLayoutFilename();
    a.click();
    URL.revokeObjectURL(url);
    markExported(sessionId).catch(err => {
      console.error('Failed to mark session as exported', err);
    });
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
  const [currentPreviewPage, setCurrentPreviewPage] = useState(1);

  const scrollToPage = useCallback((pageIndex: number) => {
    const container = brfContainerRef.current;
    if (!container) return;
    const pageElements = container.getElementsByClassName('brf-page');
    const targetPage = pageElements[pageIndex] as HTMLElement | undefined;
    if (targetPage) {
      container.scrollTo({
        top: targetPage.offsetTop,
        behavior: 'smooth'
      });
    }
  }, []);

  const handleInsertPageBreak = useCallback(() => {
    editorRef.current?.insertTextAtCursor('\f');
  }, []);

  useEffect(() => {
    if (brfPages.length > 0 && currentPreviewPage > brfPages.length) {
      setCurrentPreviewPage(brfPages.length);
    }
  }, [brfPages.length, currentPreviewPage]);

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

    // Determine active page
    const pageElements = container.getElementsByClassName('brf-page');
    let activeIndex = 0;
    for (let i = 0; i < pageElements.length; i++) {
      const pageEl = pageElements[i] as HTMLElement;
      if (pageEl.offsetTop - container.scrollTop <= container.clientHeight / 2) {
        activeIndex = i;
      } else {
        break;
      }
    }
    setCurrentPreviewPage(activeIndex + 1);
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
      <a className="skip-link" href="#main-content">{t('app.brand.skipLink')}</a>

      {/* ── Header toolbar ───────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-title">
          <h1>{t('app.brand.title')}</h1>
          <span className="subtitle">{t('app.brand.subtitle')}</span>
        </div>

        <div className="toolbar-container">
          <div className="tab-list" role="tablist">
            <button 
              className={`tab-btn${activeTab === 'file' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('file')}
              role="tab"
              aria-selected={activeTab === 'file'}
            >
              {t('app.tabs.file')}
            </button>
            <button 
              className={`tab-btn${activeTab === 'view' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('view')}
              role="tab"
              aria-selected={activeTab === 'view'}
            >
              {t('app.tabs.view')}
            </button>
            <button 
              className={`tab-btn${activeTab === 'languages-codes' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('languages-codes')}
              role="tab"
              aria-selected={activeTab === 'languages-codes'}
            >
              {t('app.tabs.languagesCodes')}
            </button>
            <button 
              className={`tab-btn${activeTab === 'tools' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('tools')}
              role="tab"
              aria-selected={activeTab === 'tools'}
            >
              {t('app.tabs.tools')}
            </button>
            <button 
              className={`tab-btn${activeTab === 'help' ? ' tab-btn--active' : ''}`}
              onClick={() => setActiveTab('help')}
              role="tab"
              aria-selected={activeTab === 'help'}
            >
              {t('app.tabs.help')}
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
                  title={t('app.file.import.title')}
                  aria-label={t('app.file.import.ariaLabel')}
                >
                  {t('app.file.import.label')}
                </button>

                <button
                  className="toolbar-btn"
                  onClick={handleOpenDrafts}
                  disabled={isPerkinsMode}
                  title={t('app.file.drafts.title')}
                  aria-label={t('app.file.drafts.ariaLabel')}
                >
                  {drafts.length > 0
                    ? t('app.file.drafts.labelWithCount', { count: drafts.length })
                    : t('app.file.drafts.label')}
                </button>

                <button
                  className={`toolbar-btn toolbar-btn--primary${showExport ? ' toolbar-btn--active' : ''}`}
                  onClick={() => {
                    setShowExport(s => !s);
                    setShowPrint(false);
                  }}
                  disabled={isPerkinsMode}
                  aria-expanded={showExport}
                  aria-controls="export-panel"
                  title={t('app.file.export.title')}
                  aria-label={t('app.file.export.ariaLabel')}
                >
                  {t('app.file.export.label')}
                </button>

                <select
                  className="table-select"
                  value={ttsEngine}
                  onChange={e => handleTtsEngineChange(e.target.value as TtsEngineId)}
                  disabled={isPerkinsMode || mp3Exporting}
                  title={t(`tts.${ttsEngine}.description`)}
                  aria-label={t('app.file.tts.selectAriaLabel')}
                >
                  {TTS_ENGINE_IDS.map(engineId => (
                    <option key={engineId} value={engineId} title={t(`tts.${engineId}.description`)}>
                      {t(`tts.${engineId}.label`)}
                    </option>
                  ))}
                </select>

                <button
                  className="toolbar-btn"
                  onClick={() => { void handleDownloadMp3(); }}
                  disabled={!inputText.trim() || isPerkinsMode || mp3Exporting}
                  title={t('app.file.downloadMp3.title')}
                  aria-label={t('app.file.downloadMp3.ariaLabel')}
                  aria-busy={mp3Exporting}
                >
                  {mp3Exporting
                    ? (mp3ExportStatus || t('app.file.downloadMp3.exportingLabel'))
                    : t('app.file.downloadMp3.label')}
                </button>

                <button
                  className={`toolbar-btn${showPrint ? ' toolbar-btn--active' : ''}`}
                  onClick={() => {
                    setShowPrint(s => !s);
                    setShowExport(false);
                  }}
                  disabled={isPerkinsMode}
                  aria-expanded={showPrint}
                  title={t('app.file.print.title')}
                >
                  {t('app.file.print.label')}
                </button>
                {mp3ExportError && (
                  <span
                    className="toolbar-error"
                    role="alert"
                    title={mp3ExportError}
                    style={{ marginLeft: '0.5rem', color: 'var(--danger, #c62828)', fontSize: '0.85rem', maxWidth: '28rem' }}
                  >
                    {t('app.file.downloadMp3.errorPrefix', { error: mp3ExportError })}
                  </span>
                )}
              </div>
            )}

            {activeTab === 'view' && (
              <div className="toolbar">
                <button
                  className={`toolbar-btn${showPageSettings ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowPageSettings(s => !s)}
                  aria-expanded={showPageSettings}
                  aria-controls="page-settings-panel"
                  title={t('app.view.layoutSettings.title')}
                >
                  {t('app.view.layoutSettings.label')}
                </button>

                <button
                  className={`toolbar-btn${syncHighlight ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setSyncHighlight(s => !s)}
                  disabled={isPerkinsMode}
                  title={t('app.view.syncHighlight.title')}
                  aria-label={t('app.view.syncHighlight.ariaLabel')}
                >
                  {t('app.view.syncHighlight.label')}
                </button>

                <button
                  className="theme-toggle"
                  onClick={cycleTheme}
                  aria-label={t('app.view.theme.cycleAriaLabel', { theme, nextTheme: t(nextThemeLabelKey[theme]) })}
                  title={t('app.view.theme.cycleTitle')}
                >
                  {t(nextThemeLabelKey[theme])}
                </button>
              </div>
            )}

            {activeTab === 'languages-codes' && (
              <div className="toolbar">
                <label className="toolbar-label" htmlFor="table-select">
                  {t('app.languages.table.label')}
                </label>
                <select
                  id="table-select"
                  className="table-select"
                  value={selectedTable}
                  onChange={(e) => setSelectedTable(e.target.value)}
                  disabled={isPerkinsMode}
                  title={t('app.languages.table.title')}
                  aria-label={t('app.languages.table.ariaLabel')}
                >
                  {TABLE_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.tables.map((table) => (
                        <option key={table.file} value={table.file}>
                          {table.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                <label className="toolbar-label" htmlFor="language-select" style={{ marginInlineStart: '0.5rem' }}>
                  {t('app.languages.language.label')}
                </label>
                <select
                  id="language-select"
                  className="language-select"
                  value={uiLocale}
                  onChange={(e) => handleLanguageChange(e.target.value as UiLocaleId)}
                  title={t('app.languages.language.label')}
                  aria-label={t('app.languages.language.ariaLabel')}
                >
                  {UI_LOCALES.map((locale) => (
                    <option key={locale.id} value={locale.id}>
                      {locale.nativeLabel}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className={`toolbar-btn${autoPairTable ? ' toolbar-btn--active' : ''}`}
                  onClick={handleAutoPairToggle}
                  aria-pressed={autoPairTable}
                  style={{ marginInlineStart: '0.5rem' }}
                  title={autoPairTable ? t('app.languages.autoPair.on.title') : t('app.languages.autoPair.off.title')}
                  aria-label={autoPairTable ? t('app.languages.autoPair.on.label') : t('app.languages.autoPair.off.label')}
                >
                  {autoPairTable ? t('app.languages.autoPair.on.label') : t('app.languages.autoPair.off.label')}
                </button>
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="toolbar">
                <button
                  className={`toolbar-btn${isPerkinsMode ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setIsPerkinsMode(s => !s)}
                  aria-expanded={isPerkinsMode}
                  title={t('app.tools.perkins.title')}
                >
                  {t('app.tools.perkins.label')}
                </button>

                <button
                  className={`toolbar-btn${showGraphicsEditor ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowGraphicsEditor(s => !s)}
                  disabled={isPerkinsMode}
                  title={t('app.tools.graphics.title')}
                  aria-label={t('app.tools.graphics.ariaLabel')}
                >
                  {t('app.tools.graphics.label')}
                </button>

                <button
                  className={`toolbar-btn${showAlphabetGenerator ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowAlphabetGenerator(s => !s)}
                  disabled={isPerkinsMode}
                  title={t('app.tools.alphabet.title')}
                  aria-label={t('app.tools.alphabet.ariaLabel')}
                >
                  {t('app.tools.alphabet.label')}
                </button>

                <button
                  className={`toolbar-btn${showMusicBrailleGuide ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowMusicBrailleGuide(true)}
                  disabled={isPerkinsMode}
                  title="Recommended workflow for Music Braille using MuseScore and Sao Mai Braille"
                  aria-label="Open Music Braille recommendation guide"
                  aria-expanded={showMusicBrailleGuide}
                >
                  Music Braille
                </button>

                <button
                  className="toolbar-btn"
                  onClick={() => setShowStlExportDialog(true)}
                  disabled={isPerkinsMode}
                  title={t('app.tools.stl.title')}
                  aria-label={t('app.tools.stl.ariaLabel')}
                >
                  {t('app.tools.stl.label')}
                </button>

                <button
                  className={`toolbar-btn${showGradingPrintLayoutDialog ? ' toolbar-btn--active' : ''}`}
                  onClick={() => setShowGradingPrintLayoutDialog(true)}
                  disabled={!inputText.trim() || isPerkinsMode}
                  title={t('app.tools.grading.title')}
                  aria-label={t('app.tools.grading.ariaLabel')}
                  aria-expanded={showGradingPrintLayoutDialog}
                >
                  {t('app.tools.grading.label')}
                </button>

                <span className="toolbar-label" style={{ margin: '0 0.5rem' }}>
                  {t('app.tools.uebMathHint')}
                </span>
                <button
                  className="toolbar-btn"
                  id="ai-prompt-btn"
                  onClick={() => {
                    const promptText = t('app.tools.copyAiPrompt.promptText');
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
                      btn.innerText = t('app.tools.copied');
                      setTimeout(() => { btn.innerText = originalText; }, 2000);
                    }
                  }}
                  title={t('app.tools.copyAiPrompt.title')}
                  aria-label={t('app.tools.copyAiPrompt.ariaLabel')}
                >
                  {t('app.tools.copyAiPrompt.label')}
                </button>
              </div>
            )}

            {activeTab === 'help' && (
              <div className="toolbar">
                <button
                  className="toolbar-btn guide-btn"
                  onClick={() => setShowWelcome(true)}
                  aria-label={t('app.help.userGuide.ariaLabel')}
                  title={t('app.help.userGuide.title')}
                >
                  {t('app.help.userGuide.label')}
                </button>

                <button
                  className="toolbar-btn guide-btn"
                  onClick={() => setShowMusicBrailleGuide(true)}
                  aria-label="Open Music Braille recommendation guide"
                  title="Recommended MuseScore and Sao Mai Braille workflow for Music Braille"
                  aria-expanded={showMusicBrailleGuide}
                >
                  Music Braille Guide
                </button>

                <button
                  className="toolbar-btn guide-btn"
                  onClick={() => setShowPrivacyPolicy(true)}
                  aria-label={t('app.help.privacy.ariaLabel')}
                  title={t('app.help.privacy.title')}
                >
                  {t('app.help.privacy.label')}
                </button>

                <a
                  href="https://buymeacoffee.com/grahamthetvi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="toolbar-btn tip-me-btn"
                  title={t('app.help.tipMe.title')}
                  aria-label={t('app.help.tipMe.ariaLabel')}
                >
                  {t('app.help.tipMe.label')}
                </a>

                <span className="toolbar-version" style={{ marginInlineStart: 'auto', alignSelf: 'center', paddingInlineEnd: '1rem', fontSize: '0.8rem', opacity: 0.6 }}>
                  {t('app.help.build', { buildNumber: import.meta.env.VITE_GITHUB_BUILD_NUMBER || 'dev' })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Compact export / print bars — full-width rows below the toolbar */}
        {showExport && (
          <div className="header-print-bar" id="export-panel">
            <ExportPanel
              onDownloadBrf={handleDownloadBrf}
              onDownloadPrintLayout={handleDownloadPrintLayoutText}
              onOpenAudio={() => setShowAudioExport(true)}
              canDownloadBrf={Boolean(translatedText)}
              canDownloadPrintLayout={Boolean(inputText.trim())}
              canExportAudio={Boolean(inputText.trim())}
              mp3Exporting={mp3Exporting}
              mp3ExportStatus={mp3ExportStatus}
              disabled={isPerkinsMode}
            />
          </div>
        )}
        {showPrint && (
          <div className="header-print-bar">
            <PrintPanel
              brf={formattedBrfForPrint || translatedText}
              bridgeConnected={bridgeConnected}
              useWebUSB={useWebUSB}
              compact
              cellsPerRow={pageSettings.cellsPerRow}
              linesPerPage={pageSettings.linesPerPage}
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
          <div className="pane-title-row">
            <div className="pane-title" style={{ margin: 0 }}>
              {t('app.panes.textInput.title')}
            </div>
            <button
              className="layout-settings-btn"
              onClick={handleInsertPageBreak}
              title={t('app.pageBreak.title')}
              aria-label={t('app.pageBreak.ariaLabel')}
            >
              {t('app.pageBreak.label')}
            </button>
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
              aria-label={t('app.panes.brfPreview.ariaLabel')}
              aria-live="polite"
            >
              {/* Pane title row with settings toggle */}
              <div className="pane-title-row">
                <div className="pane-title">
                  {t('app.panes.brfPreview.title')}
                  {isLoading && translatedText && (
                    <span className="preview-loading">{t('app.panes.brfPreview.translatingSuffix')}</span>
                  )}
                </div>
                {brfPages.length > 1 && (
                  <div className="preview-page-navigation" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      className="layout-settings-btn"
                      onClick={() => scrollToPage(currentPreviewPage - 2)}
                      disabled={currentPreviewPage <= 1}
                      title={t('app.pageNav.prev.title')}
                      aria-label={t('app.pageNav.prev.ariaLabel')}
                    >
                      {t('app.pageNav.prev.symbol')}
                    </button>
                    <span className="toolbar-label" style={{ fontSize: '0.75rem', minWidth: '70px', textAlign: 'center', userSelect: 'none' }}>
                      {t('app.pageNav.pageOf', { current: currentPreviewPage, total: brfPages.length })}
                    </span>
                    <button
                      className="layout-settings-btn"
                      onClick={() => scrollToPage(currentPreviewPage)}
                      disabled={currentPreviewPage >= brfPages.length}
                      title={t('app.pageNav.next.title')}
                      aria-label={t('app.pageNav.next.ariaLabel')}
                    >
                      {t('app.pageNav.next.symbol')}
                    </button>
                  </div>
                )}
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
                      title={t('app.layoutSettings.presets.usLetter.title')}
                    >
                      {t('app.layoutSettings.presets.usLetter.label')}
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
                      title={t('app.layoutSettings.presets.wideTractor.title')}
                    >
                      {t('app.layoutSettings.presets.wideTractor.label')}
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn ${pageSettings.paperFormat === 'custom' ? 'toolbar-btn--active' : ''}`}
                      style={{ cursor: 'default' }}
                      title={t('app.layoutSettings.presets.custom.title')}
                    >
                      {t('app.layoutSettings.presets.custom.label')}
                    </button>
                  </div>
                  <label className="settings-field">
                    <span>{t('app.layoutSettings.cellsPerRow.label')}</span>
                    <input
                      type="number"
                      min={10}
                      max={100}
                      value={pageSettings.cellsPerRow}
                      onChange={handleCellsChange}
                      aria-label={t('app.layoutSettings.cellsPerRow.ariaLabel')}
                    />
                  </label>
                  <label className="settings-field">
                    <span>{t('app.layoutSettings.linesPerPage.label')}</span>
                    <input
                      type="number"
                      min={5}
                      max={50}
                      value={pageSettings.linesPerPage}
                      onChange={handleLinesChange}
                      aria-label={t('app.layoutSettings.linesPerPage.ariaLabel')}
                    />
                  </label>
                  <label className="settings-field">
                    <input
                      type="checkbox"
                      checked={pageSettings.showPageNumbers || false}
                      onChange={(e) => setPageSettings(s => ({ ...s, showPageNumbers: e.target.checked }))}
                      aria-label={t('app.layoutSettings.showPageNums.ariaLabel')}
                    />
                    <span>{t('app.layoutSettings.showPageNums.label')}</span>
                  </label>

                  <div
                    className="paragraph-format-block"
                    role="group"
                    aria-label={t('app.layoutSettings.paragraphFormat.ariaLabel')}
                  >
                    <div className="paragraph-format-heading">{t('app.layoutSettings.paragraphFormat.heading')}</div>
                    <p className="settings-hint paragraph-format-note">
                      {t('app.layoutSettings.paragraphFormat.note')}
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
                          <div className="paragraph-matrix-rowhead">{t('app.layoutSettings.paragraphFormat.rowHead', { n: first })}</div>
                          {[1, 2, 3, 4, 5].map((run) => {
                            const active =
                              pageSettings.paragraphFirstLineStartCell === first &&
                              pageSettings.paragraphRunoverStartCell === run;
                            return (
                              <button
                                key={`${first}-${run}`}
                                type="button"
                                className={`paragraph-matrix-cell${active ? ' paragraph-matrix-cell--active' : ''}`}
                                aria-label={t('app.layoutSettings.paragraphFormat.matrixCellAriaLabel', { first, run })}
                                aria-pressed={active}
                                onClick={() =>
                                  setPageSettings((s) => ({
                                    ...s,
                                    paragraphFirstLineStartCell: first,
                                    paragraphRunoverStartCell: run,
                                  }))
                                }
                              >
                                {t('app.layoutSettings.paragraphFormat.cellLabel', { first, run })}
                              </button>
                            );
                          })}
                        </Fragment>
                      ))}
                    </div>
                    <div className="paragraph-format-quick">
                      <span className="paragraph-format-quick-label">{t('app.layoutSettings.paragraphFormat.quickLabel')}</span>
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
                        {t('app.layoutSettings.paragraphFormat.quickFlush')}
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
                        {t('app.layoutSettings.paragraphFormat.quickLiterary')}
                      </button>
                    </div>
                  </div>

                  <p className="settings-hint">
                    {t('app.layoutSettings.sizeHint')}
                  </p>

                  <div className="viewplus-layout-block" role="group" aria-label={t('app.layoutSettings.embosserPadding.ariaLabel')}>
                    <div className="viewplus-layout-heading">{t('app.layoutSettings.embosserPadding.heading')}</div>
                    <p className="viewplus-layout-note">
                      {t('app.layoutSettings.embosserPadding.note')}
                    </p>
                    <label className="settings-field">
                      <span>{t('app.layoutSettings.embosserPadding.leftPadding.label')}</span>
                      <input
                        type="number"
                        min={-80}
                        max={80}
                        value={pageSettings.viewPlusLeftPadCells}
                        onChange={handleViewPlusPadChange}
                        aria-label={t('app.layoutSettings.embosserPadding.leftPadding.ariaLabel')}
                      />
                    </label>
                    <p className="settings-hint viewplus-padding-hint">
                      {t('app.layoutSettings.embosserPadding.appliedHint')}
                    </p>
                    <label className="settings-field">
                      <span>{t('app.layoutSettings.embosserPadding.quickPreset.label')}</span>
                      <select
                        key={viewPlusPresetKey}
                        className="viewplus-preset-select"
                        aria-label={t('app.layoutSettings.embosserPadding.quickPreset.ariaLabel')}
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
                        <option value="">{t('app.layoutSettings.embosserPadding.quickPreset.placeholder')}</option>
                        <option value="none">{t('app.layoutSettings.embosserPadding.quickPreset.none')}</option>
                        <option value="max">{t('app.layoutSettings.embosserPadding.quickPreset.viewPlusMax')}</option>
                        <option value="rogue">{t('app.layoutSettings.embosserPadding.quickPreset.viewPlusRogue')}</option>
                        <option value="premier">{t('app.layoutSettings.embosserPadding.quickPreset.viewPlusPremier')}</option>
                        <option value="embraille">{t('app.layoutSettings.embosserPadding.quickPreset.viewPlusEmBraille')}</option>
                      </select>
                    </label>
                  </div>

                  <div className="display-settings-block" role="group" aria-label={t('app.layoutSettings.brailleDisplay.ariaLabel')}>
                    <div className="display-settings-heading">{t('app.layoutSettings.brailleDisplay.heading')}</div>
                    <label className="settings-field">
                      <span>{t('app.layoutSettings.brailleDisplay.displaySize.label')}</span>
                      <input
                        type="range"
                        min={14}
                        max={36}
                        value={brailleSize}
                        onChange={(e) => setBrailleSize(parseInt(e.target.value, 10))}
                        aria-label={t('app.layoutSettings.brailleDisplay.displaySize.ariaLabel')}
                      />
                      <span className="settings-value-label">{t('app.layoutSettings.brailleDisplay.displaySize.valueSuffix', { px: brailleSize })}</span>
                    </label>
                    <label className="settings-field">
                      <input
                        type="checkbox"
                        checked={showEmptyDots}
                        onChange={(e) => setShowEmptyDots(e.target.checked)}
                        aria-label={t('app.layoutSettings.brailleDisplay.showEmptyDots.ariaLabel')}
                      />
                      <span>{t('app.layoutSettings.brailleDisplay.showEmptyDots.label')}</span>
                    </label>
                    {showEmptyDots && (
                      <label className="settings-field">
                        <span>{t('app.layoutSettings.brailleDisplay.emptyDotSize.label')}</span>
                        <input
                          type="range"
                          min={2.0}
                          max={5.0}
                          step={0.1}
                          value={inactiveDotSize}
                          onChange={(e) => setInactiveDotSize(parseFloat(e.target.value))}
                          aria-label={t('app.layoutSettings.brailleDisplay.emptyDotSize.ariaLabel')}
                        />
                        <span className="settings-value-label">{t('app.layoutSettings.brailleDisplay.emptyDotSize.value', { px: inactiveDotSize.toFixed(1) })}</span>
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
                  aria-label={t('app.panes.translating', { progress })}
                >
                  <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                  <span className="progress-label">{progress}%</span>
                </div>
              )}

              {error && (
                <p className="translation-error" role="alert">
                  {t('app.layoutSettings.translationErrorPrefix', { error })}
                </p>
              )}

              {/* Paginated Word-like braille output */}
              {brfPages.length > 0 ? (
                <div 
                  className="brf-pages-container" 
                  aria-label={t('app.layoutSettings.braillePreviewAriaLabel')}
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
                        aria-label={t('app.layoutSettings.pageLabel', { page: i + 1, total: brfPages.length })}
                      >
                        <div className="brf-page-number" aria-hidden="true">
                          {t('app.layoutSettings.pageMarker', { page: i + 1 })}
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
                    ? t('app.layoutSettings.placeholders.typeToSee')
                    : t('app.layoutSettings.placeholders.loading')}
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
          defaultCellsPerRow={pageSettings.cellsPerRow}
          defaultLinesPerPage={pageSettings.linesPerPage}
          onInsert={(brf) => {
            editorRef.current?.insertTextAtCursor(brf);
            setShowGraphicsEditor(false);
          }}
          onClose={() => setShowGraphicsEditor(false)}
        />
      )}

      {showAlphabetGenerator && (
        <AlphabetGeneratorModal
          onInsert={(text) => {
            editorRef.current?.insertTextAtCursor(text);
            setShowAlphabetGenerator(false);
          }}
          onClose={() => setShowAlphabetGenerator(false)}
        />
      )}

      {showMusicBrailleGuide && (
        <MusicBrailleGuideModal
          onInsertIntoEditor={(text) => {
            editorRef.current?.insertTextAtCursor(text);
            setShowMusicBrailleGuide(false);
            setActiveTab('file');
          }}
          onClose={() => setShowMusicBrailleGuide(false)}
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
          selectedTable={selectedTable}
          mathCode={mathCode}
        />
      )}

      {showAudioExport && (
        <AudioExportDialog
          open={showAudioExport}
          onClose={() => {
            if (!mp3Exporting) {
              setShowAudioExport(false);
              setMp3ExportError(null);
            }
          }}
          engine={ttsEngine}
          onEngineChange={handleTtsEngineChange}
          onExport={() => { void handleDownloadMp3(); }}
          exporting={mp3Exporting}
          exportStatus={mp3ExportStatus}
          exportError={mp3ExportError}
          canExport={Boolean(inputText.trim()) && !isPerkinsMode}
        />
      )}

      {showGradingPrintLayoutDialog && (
        <GradingPrintLayoutDialog
          onClose={() => setShowGradingPrintLayoutDialog(false)}
          onDownload={handleDownloadGradingPrintLayoutText}
          gradingSheetOnAllPages={gradingSheetOnAllPages}
          onGradingSheetOnAllPagesChange={setGradingSheetOnAllPages}
          disabled={!inputText.trim() || isPerkinsMode}
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
