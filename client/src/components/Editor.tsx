import { useEffect, useRef } from 'react';
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
}

/**
 * Monaco Editor wrapper component.
 * Stores the editor value in a ref (not state) to avoid re-render storms
 * on every keystroke. Debounces translation calls by 500ms.
 */
export function Editor({
  onTextChange,
  initialValue = '',
  monacoTheme = 'vs-dark',
  value,
  cellsPerRow = 40,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents the onDidChangeModelContent handler from firing during a
  // programmatic setValue() call, which would cause an update loop.
  const isExternalUpdate = useRef(false);

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
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
    });

    editorRef.current.onDidChangeModelContent(() => {
      if (isExternalUpdate.current) return;
      const text = editorRef.current?.getValue() ?? '';

      // Debounce: only notify after 500ms of inactivity
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onTextChange(text);
      }, 500);
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

  // Keep word-wrap column and ruler in sync with page settings
  useEffect(() => {
    editorRef.current?.updateOptions({
      wordWrapColumn: cellsPerRow,
      rulers: [cellsPerRow],
    });
  }, [cellsPerRow]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    />
  );
}
