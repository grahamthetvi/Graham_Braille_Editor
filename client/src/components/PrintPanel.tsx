import { useState } from 'react';
import { printBrf } from '../services/bridge-client';

interface PrintPanelProps {
  brf: string;
  bridgeConnected: boolean;
  /** Renders as a compact horizontal bar for use inside the app header. */
  compact?: boolean;
}

/**
 * Printer selection and print button panel.
 * Sends the translated BRF content to the local bridge binary.
 * When `compact` is true, renders horizontally for use inside the header toolbar.
 */
export function PrintPanel({ brf, bridgeConnected, compact }: PrintPanelProps) {
  const [printerName, setPrinterName] = useState('');
  const [status, setStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handlePrint() {
    if (!printerName.trim()) {
      setErrorMsg('Please enter a printer name.');
      return;
    }
    if (!brf) {
      setErrorMsg('No Braille content to print. Type something first.');
      return;
    }
    setStatus('printing');
    setErrorMsg('');
    try {
      await printBrf(printerName.trim(), brf);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  if (compact) {
    return (
      <div className="print-panel-compact">
        {!bridgeConnected && (
          <span className="bridge-badge" role="status">Bridge offline</span>
        )}
        <label htmlFor="printer-name-compact">Printer</label>
        <input
          id="printer-name-compact"
          type="text"
          className="printer-input"
          placeholder="e.g. ViewPlus Columbia"
          value={printerName}
          onChange={(e) => setPrinterName(e.target.value)}
          disabled={!bridgeConnected}
        />
        <button
          className="toolbar-btn toolbar-btn--primary"
          onClick={handlePrint}
          disabled={!bridgeConnected || status === 'printing'}
        >
          {status === 'printing' ? 'Sending…' : 'Print'}
        </button>
        {status === 'success' && (
          <span className="print-status-ok" aria-live="polite">✓ Sent</span>
        )}
        {(status === 'error' || (errorMsg && status === 'idle')) && (
          <span className="print-status-err" role="alert">{errorMsg}</span>
        )}
      </div>
    );
  }

  return (
    <div className="print-panel">
      <h3>Print to Embosser</h3>

      {!bridgeConnected && (
        <p className="bridge-warning" role="status">
          Bridge not connected. Download and run the bridge binary to enable printing.
        </p>
      )}

      <label htmlFor="printer-name">Printer Name</label>
      <input
        id="printer-name"
        type="text"
        placeholder="e.g. ViewPlus Columbia"
        value={printerName}
        onChange={(e) => setPrinterName(e.target.value)}
        disabled={!bridgeConnected}
      />

      <button
        onClick={handlePrint}
        disabled={!bridgeConnected || status === 'printing'}
      >
        {status === 'printing' ? 'Printing...' : 'Print'}
      </button>

      {status === 'success' && (
        <p className="status-ok" aria-live="polite">Sent to embosser successfully.</p>
      )}
      {status === 'error' && (
        <p className="status-err" role="alert">Error: {errorMsg}</p>
      )}
      {errorMsg && status === 'idle' && (
        <p className="status-err" role="alert">{errorMsg}</p>
      )}
    </div>
  );
}
