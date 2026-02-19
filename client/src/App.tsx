import { useEffect, useRef, useState } from 'react';
import { Editor } from './components/Editor';
import { PrintPanel } from './components/PrintPanel';
import { StatusBar } from './components/StatusBar';
import { startBridgeStatusPolling } from './services/bridge-client';
import { useBraille } from './hooks/useBraille';
import './App.css';

/**
 * Root application component.
 *
 * Architecture:
 * - Monaco Editor captures text input (debounced 500ms)
 * - Text is sent to a Web Worker running liblouis for Braille translation
 *   via the useBraille hook.
 * - Translated BRF is displayed and made available to PrintPanel
 * - PrintPanel sends BRF to the local Go bridge for raw embosser printing
 *
 * Integration test widget (Phase 2A):
 * - A plain <textarea> + "Translate" button lets you verify the pipeline
 *   without the Monaco editor layer.
 */
export default function App() {
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const { translate, translatedText, isLoading, error, workerReady } = useBraille();

  // ── Integration test widget state ────────────────────────────────────────
  const [testInput, setTestInput] = useState('Hello Braille world!');
  const [testOutput, setTestOutput] = useState('');
  const prevBrfRef = useRef('');

  // Capture translation results for the integration test widget.
  useEffect(() => {
    if (translatedText !== prevBrfRef.current) {
      prevBrfRef.current = translatedText;
      setTestOutput(translatedText);
    }
  }, [translatedText]);

  // ── Bridge status polling ────────────────────────────────────────────────
  useEffect(() => {
    const stopPolling = startBridgeStatusPolling(setBridgeConnected);
    return stopPolling;
  }, []);

  // ── Monaco editor handler ────────────────────────────────────────────────
  function handleTextChange(text: string) {
    translate(text);
  }

  // ── Integration test handler ─────────────────────────────────────────────
  function handleTranslateClick() {
    translate(testInput);
  }

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>Braille Vibe</h1>
        <p className="subtitle">Braille Editing &amp; Embossing Suite</p>
      </header>

      {/* ── Phase 2A integration test widget ─────────────────────────────── */}
      <section
        className="integration-test"
        style={{
          margin: '0 1rem 1rem',
          padding: '1rem',
          border: '1px solid #555',
          borderRadius: '6px',
          background: '#1e1e1e',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '0.9rem', color: '#ccc' }}>
          Phase 2A — LibLouis Integration Test
          <span
            style={{
              marginLeft: '0.75rem',
              fontSize: '0.75rem',
              color: workerReady ? '#4ec94e' : '#f0a500',
            }}
          >
            {workerReady ? '● worker ready' : '● worker loading…'}
          </span>
        </h2>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            rows={3}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              background: '#2d2d2d',
              color: '#eee',
              border: '1px solid #555',
              borderRadius: '4px',
              padding: '0.5rem',
              resize: 'vertical',
            }}
            placeholder="Type text to translate…"
          />
          <button
            onClick={handleTranslateClick}
            disabled={!workerReady || isLoading}
            style={{
              padding: '0.5rem 1rem',
              background: workerReady ? '#4ec94e' : '#555',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: workerReady ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              alignSelf: 'flex-start',
            }}
          >
            {isLoading ? '…' : 'Translate'}
          </button>
        </div>

        {error && (
          <p style={{ color: '#f66', marginTop: '0.5rem', fontSize: '0.8rem' }}>
            Error: {error}
          </p>
        )}

        {testOutput && (
          <pre
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem',
              background: '#111',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#7fff7f',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {testOutput}
          </pre>
        )}
      </section>

      <main className="app-main">
        <section className="editor-pane">
          <h2>Text Input</h2>
          <Editor onTextChange={handleTextChange} />
        </section>

        <aside className="side-pane">
          <section className="brf-preview">
            <h2>BRF Preview</h2>
            <pre className="brf-output">
              {translatedText || '(start typing to see Braille output)'}
            </pre>
          </section>

          <PrintPanel brf={translatedText} bridgeConnected={bridgeConnected} />
        </aside>
      </main>

      <StatusBar bridgeConnected={bridgeConnected} brfLength={translatedText.length} />
    </div>
  );
}
