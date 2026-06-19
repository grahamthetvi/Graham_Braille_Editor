import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as monaco from 'monaco-editor';

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
}

export interface EditorHandle {
  insertTextAtCursor: (text: string) => void;
  /** Replace editor content without firing onTextChange (debounced translate stays quiet). */
  setValueFromBrailleSync: (text: string) => void;
  /** Replace a specific range of text */
  replaceRange: (startOffset: number, endOffset: number, text: string) => void;
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
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents the onDidChangeModelContent handler from firing during a
  // programmatic setValue() call, which would cause an update loop.
  const isExternalUpdate = useRef(false);
  const onTextChangeRef = useRef(onTextChange);
  useEffect(() => {
    onTextChangeRef.current = onTextChange;
  }, [onTextChange]);

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
    }
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
      if (!editor || !onScrollPercentageChange) return;
      
      const scrollHeight = editor.getContentHeight();
      const clientHeight = editor.getLayoutInfo().height;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);
      
      if (maxScroll > 0) {
        const clampedTop = Math.max(0, Math.min(e.scrollTop, maxScroll));
        onScrollPercentageChange(clampedTop / maxScroll);
      } else {
        onScrollPercentageChange(0);
      }
    });

    editorRef.current.onDidChangeModelContent(() => {
      if (isExternalUpdate.current) return;
      const text = editorRef.current?.getValue() ?? '';

      // Debounce: only notify after 800ms of inactivity
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onTextChangeRef.current(text);
      }, 800);
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

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
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

  // Push externally controlled scroll position into the editor
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || scrollPercentage === undefined) return;
    
    const scrollHeight = editor.getContentHeight();
    const clientHeight = editor.getLayoutInfo().height;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    
    if (maxScroll > 0) {
      const targetTop = scrollPercentage * maxScroll;
      if (Math.abs(editor.getScrollTop() - targetTop) > 1) {
        editor.setScrollTop(targetTop);
      }
    }
  }, [scrollPercentage]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    />
  );
});
