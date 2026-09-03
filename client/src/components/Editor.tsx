import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as monaco from 'monaco-editor';
import { SixKeyChordTracker, UNICODE_BRAILLE_BLANK, sixKeyEventToDot } from '../utils/sixKeyBraille';
import { lineFromProgress, progressFromLine } from '../utils/scrollProgress';

interface EditorProps {
  onTextChange: (text: string) => void;
  initialValue?: string;
  /** Monaco editor theme name: 'vs-dark' | 'vs' | 'hc-black' */
  monacoTheme?: string;
  /**
   * When this prop changes to a new string the editor content is replaced.
   * Use this to push externally loaded file content into the editor.
   */
  value?: string;
  /** Number of characters at which text wraps; also draws a column ruler. */
  cellsPerRow?: number;
  /** Callback fired when the editor is scrolled by the user, passing the percentage [0, 1] */
  onScrollPercentageChange?: (percentage: number) => void;
  /** Externally controlled scroll percentage, [0, 1] */
  scrollPercentage?: number;
  /** Callback fired when the cursor or selection changes, giving [startWordIndex, endWordIndex] */
  onSelectionChange?: (range: [number, number] | null) => void;
  /** Callback fired with the raw character offset of the cursor */
  onCursorOffsetChange?: (offset: number) => void;
  /** When true, Monaco is read-only (used while imported braille is locked). */
  readOnly?: boolean;
  /** Fired when the user tries to type/edit while readOnly. */
  onAttemptEdit?: () => void;
  /** Enable Braille Blaster–style fds/jkl 6-key chord input (Unicode cells). */
  sixKeyInput?: boolean;
}

export interface EditorHandle {
  insertTextAtCursor: (text: string) => void;
  /** Replace editor content without firing onTextChange (debounced translate stays quiet). */
  setValueFromBrailleSync: (text: string) => void;
  /** Replace a specific range of text */
  replaceRange: (startOffset: number, endOffset: number, text: string) => void;
  /** Imperatively sync scroll position (0–1) without React state. */
  setScrollPercentage: (percentage: number) => void;
  /** Move caret to a UTF-16 offset, reveal it, and focus. */
  setCursorOffset: (offset: number) => void;
  /** Focus the Monaco editor. */
  focus: () => void;
}

function editorLineProgress(editor: monaco.editor.IStandaloneCodeEditor): number {
  const model = editor.getModel();
  if (!model) return 0;
  const lineCount = model.getLineCount();
  const scrollTop = editor.getScrollTop();
  let lo = 1;
  let hi = lineCount;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (editor.getTopForLineNumber(mid) <= scrollTop + 0.5) lo = mid;
    else hi = mid - 1;
  }
  const top = editor.getTopForLineNumber(lo);
  const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
  const next = lo < lineCount ? editor.getTopForLineNumber(lo + 1) : top + lineHeight;
  const frac = next > top ? Math.max(0, Math.min(1, (scrollTop - top) / (next - top))) : 0;
  return progressFromLine(lo - 1, frac, lineCount);
}

function setEditorLineProgress(editor: monaco.editor.IStandaloneCodeEditor, percentage: number): void {
  const model = editor.getModel();
  if (!model) return;
  const lineCount = model.getLineCount();
  const { lineIndex0, frac } = lineFromProgress(percentage, lineCount);
  const line = lineIndex0 + 1;
  const top = editor.getTopForLineNumber(line);
  const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
  const next = line < lineCount ? editor.getTopForLineNumber(line + 1) : top + lineHeight;
  const target = top + (next - top) * frac;
  if (Math.abs(editor.getScrollTop() - target) > 1) {
    editor.setScrollTop(target);
  }
}

/**
 * Monaco Editor wrapper component.
 * Stores the editor value in a ref (not state) to avoid re-render storms
 * on every keystroke. Debounces translation calls by 500ms.
 */
export const Editor = forwardRef<EditorHandle, EditorProps>(({
  onTextChange,
  initialValue = '',
  monacoTheme = 'vs-dark',
  value,
  cellsPerRow = 40,
  onScrollPercentageChange,
  scrollPercentage,
  onSelectionChange,
  onCursorOffsetChange,
  readOnly = false,
  onAttemptEdit,
  sixKeyInput = false,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents the onDidChangeModelContent handler from firing during a
  // programmatic setValue() call, which would cause an update loop.
  const isExternalUpdate = useRef(false);
  const suppressScrollReportRef = useRef(false);
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);
  const onScrollPercentageChangeRef = useRef(onScrollPercentageChange);
  useEffect(() => {
    onScrollPercentageChangeRef.current = onScrollPercentageChange;
  }, [onScrollPercentageChange]);

  const onAttemptEditRef = useRef(onAttemptEdit);
  useEffect(() => {
    onAttemptEditRef.current = onAttemptEdit;
  }, [onAttemptEdit]);

  const sixKeyInputRef = useRef(sixKeyInput);
  useEffect(() => {
    sixKeyInputRef.current = sixKeyInput;
  }, [sixKeyInput]);

  const insertAtCursor = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection) return;
    editor.executeEdits('six-key', [
      {
        range: selection,
        text,
        forceMoveMarkers: true,
      },
    ]);
    editor.pushUndoStop();
  };

  useImperativeHandle(ref, () => ({
    insertTextAtCursor: (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const position = editor.getPosition();
      if (!position) return;
      editor.executeEdits('insert-api', [
        {
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: text,
          forceMoveMarkers: true,
        }
      ]);
      editor.pushUndoStop();
      editor.focus();
    },
    setValueFromBrailleSync: (text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      isExternalUpdate.current = true;

      const model = editor.getModel();
      if (model) {
        const selections = editor.getSelections();
        const selectionOffsets = selections ? selections.map(s => {
          return {
            start: model.getOffsetAt(s.getStartPosition()),
            end: model.getOffsetAt(s.getEndPosition()),
            direction: s.getDirection()
          };
        }) : [];

        editor.executeEdits('braille-sync', [{
          range: model.getFullModelRange(),
          text: text,
          forceMoveMarkers: true
        }]);
        editor.pushUndoStop();

        if (selectionOffsets.length > 0) {
          const maxOffset = model.getValueLength();
          const newSelections = selectionOffsets.map(off => {
            const safeStart = Math.min(off.start, maxOffset);
            const safeEnd = Math.min(off.end, maxOffset);
            const startPos = model.getPositionAt(safeStart);
            const endPos = model.getPositionAt(safeEnd);
            
            if (off.direction === monaco.SelectionDirection.RTL) {
              return new monaco.Selection(endPos.lineNumber, endPos.column, startPos.lineNumber, startPos.column);
            } else {
              return new monaco.Selection(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
            }
          });
          editor.setSelections(newSelections);
        }
      } else {
        editor.setValue(text);
      }
      isExternalUpdate.current = false;
    },
    replaceRange: (startOffset: number, endOffset: number, text: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;
      
      const startPos = model.getPositionAt(startOffset);
      const endPos = model.getPositionAt(endOffset);
      
      editor.executeEdits('replace-api', [
        {
          range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
          text: text,
          forceMoveMarkers: true,
        }
      ]);
      editor.pushUndoStop();
      editor.focus();
    },
    setScrollPercentage: (percentage: number) => {
      const editor = editorRef.current;
      if (!editor) return;
      suppressScrollReportRef.current = true;
      setEditorLineProgress(editor, percentage);
      suppressScrollReportRef.current = false;
    },
    setCursorOffset: (offset: number) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model) return;
      const clamped = Math.max(0, Math.min(Math.floor(offset), model.getValueLength()));
      const pos = model.getPositionAt(clamped);
      editor.setPosition(pos);
      editor.revealPositionInCenter(pos);
      editor.focus();
    },
    focus: () => {
      editorRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    editorRef.current = monaco.editor.create(containerRef.current, {
      value: initialValue,
      language: 'plaintext',
      theme: monacoTheme,
      wordWrap: 'wordWrapColumn',
      wordWrapColumn: cellsPerRow,
      rulers: [cellsPerRow],
      minimap: { enabled: false },
      fontSize: 16,
      lineHeight: 24,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      renderControlCharacters: true,
      readOnly,
    });

    editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const editor = editorRef.current;
      if (!editor) return;
      const position = editor.getPosition();
      if (!position) return;
      editor.executeEdits('keyboard-shortcut', [
        {
          range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
          text: '\f',
          forceMoveMarkers: true,
        }
      ]);
      editor.pushUndoStop();
    });

    editorRef.current.onDidScrollChange((e) => {
      const editor = editorRef.current;
      const onScroll = onScrollPercentageChangeRef.current;
      if (!editor || !onScroll) return;
      if (suppressScrollReportRef.current) return;
      if (!e.scrollTopChanged) return;
      onScroll(editorLineProgress(editor));
    });

    editorRef.current.onDidChangeModelContent((e) => {
      if (isExternalUpdate.current) return;
      const text = editorRef.current?.getValue() ?? '';

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const lineBreakChange = e.changes.some(
        (c) =>
          c.text.includes('\n') ||
          c.text.includes('\r') ||
          c.text.includes('\f') ||
          c.range.startLineNumber !== c.range.endLineNumber,
      );
      // 6-key braille editing and Enter/line-break edits update the preview immediately.
      const debounceMs = sixKeyInputRef.current || lineBreakChange ? 0 : 800;
      if (debounceMs === 0) {
        onTextChangeRef.current(text);
        return;
      }
      debounceTimer.current = setTimeout(() => {
        onTextChangeRef.current(text);
      }, debounceMs);
    });

    editorRef.current.onDidChangeCursorSelection((e) => {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      if (!model) return;

      const startOffset = model.getOffsetAt(e.selection.getStartPosition());
      const endOffset = model.getOffsetAt(e.selection.getEndPosition());
      const text = model.getValue();

      if (onCursorOffsetChange) {
        onCursorOffsetChange(startOffset);
      }

      if (!onSelectionChange) return;

      let startWord = -1;
      let endWord = -1;
      const isCursor = startOffset === endOffset;

      const regex = /\S+/g;
      let match;
      let wordIndex = 0;

      while ((match = regex.exec(text)) !== null) {
        const wStart = match.index;
        const wEnd = match.index + match[0].length;

        if (isCursor) {
          if (startOffset >= wStart && startOffset <= wEnd) {
            startWord = wordIndex;
            endWord = wordIndex;
            break;
          }
        } else {
          if (startWord === -1 && startOffset < wEnd) {
            startWord = wordIndex;
          }
          if (startWord !== -1 && endOffset > wStart) {
            endWord = wordIndex;
          }
          if (endOffset <= wStart) {
            break;
          }
        }
        wordIndex++;
      }

      if (startWord !== -1 && endWord !== -1) {
        onSelectionChange([startWord, endWord]);
      } else {
        onSelectionChange(null);
      }
    });

    const attemptDisposable = editorRef.current.onDidAttemptReadOnlyEdit(() => {
      onAttemptEditRef.current?.();
    });

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      attemptDisposable.dispose();
      editorRef.current?.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply theme changes without recreating the editor
  useEffect(() => {
    monaco.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  // Push externally loaded file content into the editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === undefined) return;
    if (editor.getValue() === value) return;
    isExternalUpdate.current = true;
    editor.setValue(value);
    isExternalUpdate.current = false;
  }, [value]);

  // Keep ruler aligned with page width (visual guide only; soft breaks use \\r between wrapped rows).
  useEffect(() => {
    editorRef.current?.updateOptions({
      wordWrapColumn: cellsPerRow,
      rulers: [cellsPerRow],
    });
  }, [cellsPerRow]);

  // Toggle read-only without recreating the editor
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Braille Blaster–style 6-key chord input
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !sixKeyInput) return;

    const tracker = new SixKeyChordTracker();
    const dom = editor.getDomNode();
    if (!dom) return;

    const hasModifier = (e: KeyboardEvent) =>
      e.ctrlKey || e.metaKey || e.altKey;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!sixKeyInputRef.current) return;
      if (hasModifier(e)) return;

      const dot = sixKeyEventToDot(e);
      if (dot !== null) {
        e.preventDefault();
        e.stopPropagation();
        tracker.keyDown(dot);
        return;
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        insertAtCursor(UNICODE_BRAILLE_BLANK);
        return;
      }

      if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        e.stopPropagation();
        insertAtCursor('\n');
        return;
      }

      // Allow navigation / editing keys through; block other printable keys.
      const passThrough = new Set([
        'Backspace',
        'Delete',
        'Tab',
        'Escape',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ]);
      if (passThrough.has(e.key) || passThrough.has(e.code)) return;
      if (e.key.length === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!sixKeyInputRef.current) return;
      if (hasModifier(e)) return;
      const dot = sixKeyEventToDot(e);
      if (dot === null) return;
      e.preventDefault();
      e.stopPropagation();
      const cell = tracker.keyUp(dot);
      if (cell) insertAtCursor(cell);
    };

    const onBlur = () => tracker.reset();

    // Capture on the editor DOM so we beat Monaco's default character input.
    dom.addEventListener('keydown', onKeyDown, true);
    dom.addEventListener('keyup', onKeyUp, true);
    dom.addEventListener('blur', onBlur, true);

    return () => {
      tracker.reset();
      dom.removeEventListener('keydown', onKeyDown, true);
      dom.removeEventListener('keyup', onKeyUp, true);
      dom.removeEventListener('blur', onBlur, true);
    };
  }, [sixKeyInput]);

  // Push externally controlled scroll position into the editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || scrollPercentage === undefined) return;
    suppressScrollReportRef.current = true;
    setEditorLineProgress(editor, scrollPercentage);
    suppressScrollReportRef.current = false;
  }, [scrollPercentage]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    />
  );
});
