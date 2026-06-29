import { useState, useEffect, type ChangeEvent } from 'react';
import { printBrf, getPrinters } from '../services/bridge-client';
import { printBrfWebUSB } from '../services/webusb-client';
import { EmbosserFactory, EMBOSSER_LIST } from '../services/embossers/EmbosserFactory';
import { isMac, isWindows } from '../utils/os';

const VIEWPLUS_SUPPORT_EMAIL = 'grahamthetvi@icloud.com';

interface PrintPanelProps {
  brf: string;
  bridgeConnected: boolean;
  useWebUSB?: boolean;
  /** Renders as a compact horizontal bar for use inside the app header. */
  compact?: boolean;
  /** From Layout: stored ViewPlus left padding (cells). */
  viewPlusLeftPadCells?: number;
  onViewPlusLeftPadCellsChange?: (cells: number) => void;
  /** From Layout: true only when paper format is US Letter 8.5×11. */
  viewPlusPaddingApplies?: boolean;
  /** Callback fired when a document is successfully sent to the printer. */
  onExport?: () => void;
  /** Current editor layout parameters */
  cellsPerRow?: number;
  linesPerPage?: number;
}

/**
 * Printer selection and print button panel.
 * Sends the translated BRF content to the local bridge binary.
 * When `compact` is true, renders horizontally for use inside the header toolbar.
 */
export function PrintPanel({
  brf,
  bridgeConnected,
  useWebUSB,
  compact,
  viewPlusLeftPadCells = 0,
  onViewPlusLeftPadCellsChange,
  viewPlusPaddingApplies = false,
  onExport,
  cellsPerRow = 32,
  linesPerPage = 25,
}: PrintPanelProps) {
  const [printerName, setPrinterName] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('generic');
  const [status, setStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [printRange, setPrintRange] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('');

  function parseCustomRange(rangeStr: string, maxPages: number): number[] {
    const pages = new Set<number>();
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-');
        const s = parseInt(start.trim(), 10);
        const e = parseInt(end.trim(), 10);
        if (!isNaN(s) && !isNaN(e)) {
          for (let i = Math.max(1, s); i <= Math.min(maxPages, e); i++) {
            pages.add(i);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= maxPages) {
          pages.add(p);
        }
      }
    }
    return Array.from(pages).sort((a, b) => a - b);
  }

  useEffect(() => {
    if (bridgeConnected && !useWebUSB) {
      setIsLoadingPrinters(true);
      getPrinters().then(printers => {
        setAvailablePrinters(printers);
        setIsLoadingPrinters(false);
        if (printers.length > 0 && !printerName) {
          handlePrinterSelect(printers[0]);
        }
      }).catch(() => setIsLoadingPrinters(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeConnected, useWebUSB]);

  function handleDriverSelect(driverId: string) {
    setSelectedDriverId(driverId);
    const embosser = EmbosserFactory.getEmbosser(driverId);
    if (embosser && typeof (embosser as any).getDefaultLeftPadCells === 'function') {
      const defaultPad = (embosser as any).getDefaultLeftPadCells();
      onViewPlusLeftPadCellsChange?.(defaultPad);
    }
  }

  function handlePrinterSelect(name: string) {
    setPrinterName(name);
    const lower = name.toLowerCase();
    let driverId = selectedDriverId;
    if (lower.includes('embraille')) {
      driverId = 'viewplus-embraille';
    } else if (lower.includes('viewplus') || lower.includes('columbia') || lower.includes('emprint') || lower.includes('max') || lower.includes('premier') || lower.includes('rogue')) {
      driverId = 'viewplus';
    } else if (lower.includes('romeo') || lower.includes('juliet') || lower.includes('enabling') || lower.includes('marathon') || lower.includes('thomas')) {
      driverId = 'enabling-romeo';
    } else if (lower.includes('index') || lower.includes('everest') || lower.includes('basic-') || lower.includes('braille box')) {
      driverId = 'index-basic';
    } else if (lower.includes('braillo')) {
      driverId = 'braillo-200';
    } else if (lower.includes('pageblaster')) {
      driverId = 'aph-pageblaster';
    } else if (lower.includes('pixblaster')) {
      driverId = 'aph-pixblaster';
    }

    if (driverId !== selectedDriverId) {
      handleDriverSelect(driverId);
    }
  }

  async function handlePrint() {
    if (!useWebUSB && !printerName.trim()) {
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
      let activeBrf = brf;

      const allPages = activeBrf.split('\f');
      if (printRange === 'custom') {
        const selectedPageNums = parseCustomRange(customRange, allPages.length);
        if (selectedPageNums.length === 0) {
          setErrorMsg('Invalid custom page range or no pages match.');
          setStatus('error');
          return;
        }
        activeBrf = selectedPageNums.map(n => allPages[n - 1]).join('\f');
      }

      if (viewPlusPaddingApplies && viewPlusLeftPadCells !== 0) {
        if (viewPlusLeftPadCells > 0) {
          const pad = ' '.repeat(viewPlusLeftPadCells);
          activeBrf = activeBrf.split(/\r?\n/).map(line => pad + line).join('\n');
        } else {
          const trimCount = Math.abs(viewPlusLeftPadCells);
          activeBrf = activeBrf.split(/\r?\n/).map(line => line.slice(trimCount)).join('\n');
        }
      }

      const embosser = EmbosserFactory.getEmbosser(selectedDriverId);
      const bytes = embosser.generateBytes(activeBrf, {
        copies: 1,
        viewPlusLeftPadCells: viewPlusPaddingApplies ? viewPlusLeftPadCells : undefined,
      });

      if (useWebUSB) {
        await printBrfWebUSB(bytes);
      } else {
        await printBrf(printerName.trim(), bytes);
      }
      setStatus('success');
      onExport?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function handlePrintBoundaryTest() {
    const W = cellsPerRow;
    const H = linesPerPage;
    const testBrf = generateBoundaryTestBrf(W, H);

    setStatus('printing');
    setErrorMsg('');
    try {
      let activeBrf = testBrf;

      if (viewPlusPaddingApplies && viewPlusLeftPadCells !== 0) {
        if (viewPlusLeftPadCells > 0) {
          const pad = ' '.repeat(viewPlusLeftPadCells);
          activeBrf = activeBrf.split(/\r?\n/).map(line => pad + line).join('\n');
        } else {
          const trimCount = Math.abs(viewPlusLeftPadCells);
          activeBrf = activeBrf.split(/\r?\n/).map(line => line.slice(trimCount)).join('\n');
        }
      }

      const embosser = EmbosserFactory.getEmbosser(selectedDriverId);
      const bytes = embosser.generateBytes(activeBrf, {
        copies: 1,
        viewPlusLeftPadCells: viewPlusPaddingApplies ? viewPlusLeftPadCells : undefined,
      });

      if (useWebUSB) {
        await printBrfWebUSB(bytes);
      } else {
        await printBrf(printerName.trim(), bytes);
      }
      setStatus('success');
      onExport?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  const renderViewPlusNotice = () => {
    if (selectedDriverId !== 'viewplus' && selectedDriverId !== 'viewplus-embraille') return null;

    const style = { fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.35 };

    return (
      <div style={compact ? { flexBasis: '100%', marginTop: '0.35rem' } : undefined}>
        <div style={{ ...style, color: '#0369a1' }}>
          <strong>ViewPlus:</strong> Single-sheet feeding and driver margins vary by model.
          If you tune the layout for your paper and want to share what works,
          email{' '}
          <a href={`mailto:${VIEWPLUS_SUPPORT_EMAIL}`}>{VIEWPLUS_SUPPORT_EMAIL}</a>.
        </div>
        {isWindows() || isMac() ? (
          <div style={{ ...style, color: '#0369a1' }}>
            <strong>Driver:</strong> Use the official ViewPlus printer driver for your embosser.
          </div>
        ) : null}

      </div>
    );
  };

  if (compact) {
    return (
      <div className="print-panel-compact">
        {!useWebUSB && !bridgeConnected && (
          <span className="bridge-badge" role="status">Bridge offline</span>
        )}
        {!useWebUSB && (
          <>
            <label htmlFor="printer-name-compact">Printer</label>
            <select
              id="printer-name-compact"
              className="printer-input"
              value={printerName}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => handlePrinterSelect(e.target.value)}
              disabled={!bridgeConnected || isLoadingPrinters}
            >
              {isLoadingPrinters ? (
                <option>Loading...</option>
              ) : availablePrinters.length === 0 ? (
                <option value="">No printers found</option>
              ) : (
                availablePrinters.map(p => <option key={p} value={p}>{p}</option>)
              )}
            </select>
          </>
        )}
        <select
          className="printer-input"
          aria-label="Embosser driver model"
          value={selectedDriverId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => handleDriverSelect(e.target.value)}
          style={{ width: '130px', marginLeft: '0.4rem' }}
        >
          {EMBOSSER_LIST.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select
          className="printer-input"
          aria-label="Print range"
          value={printRange}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setPrintRange(e.target.value as 'all' | 'custom')}
          style={{ width: '80px', marginLeft: '0.4rem' }}
        >
          <option value="all">All Pages</option>
          <option value="custom">Custom</option>
        </select>
        {printRange === 'custom' && (
          <input
            type="text"
            className="printer-input"
            placeholder="e.g. 1-3, 5"
            value={customRange}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomRange(e.target.value)}
            style={{ width: '80px', marginLeft: '0.4rem' }}
            aria-label="Custom page range"
          />
        )}
        <button
          className="toolbar-btn toolbar-btn--primary"
          onClick={handlePrint}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
        >
          {status === 'printing' ? 'Sending…' : useWebUSB ? 'Select & Print (USB)' : 'Print'}
        </button>
        <button
          className="toolbar-btn"
          onClick={handlePrintBoundaryTest}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
          title="Print a test page with numbered rows/columns to check print margins and limits"
          style={{ marginLeft: '0.4rem', border: '1px solid #cbd5e1' }}
        >
          Boundary Test
        </button>
        {bridgeConnected && !useWebUSB && (
          <button
            className="toolbar-btn"
            onClick={() => window.open('http://127.0.0.1:8080/debug', '_blank')}
            title="Open Bridge Debug Dashboard"
            style={{ marginLeft: '0.4rem', border: '1px solid #cbd5e1' }}
          >
            Debug
          </button>
        )}
        {renderViewPlusNotice()}
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
      <h3>{useWebUSB ? 'WebUSB Embossing' : 'Print to Embosser'}</h3>

      {!useWebUSB && !bridgeConnected && (
        <p className="bridge-warning" role="status">
          Bridge not connected. Download and run the bridge binary to enable printing.
        </p>
      )}

      {useWebUSB ? (
        <p className="webusb-info" style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#666' }}>
          Select your embosser securely directly from the browser window prompt.
        </p>
      ) : (
        <>
          <label htmlFor="printer-name">Select Printer</label>
          <select
            id="printer-name"
            value={printerName}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handlePrinterSelect(e.target.value)}
            disabled={!bridgeConnected || isLoadingPrinters}
            style={{ padding: '0.4rem', marginBottom: '1rem' }}
          >
            {isLoadingPrinters ? (
              <option>Loading...</option>
            ) : availablePrinters.length === 0 ? (
              <option value="">No printers found on computer</option>
            ) : (
              availablePrinters.map(p => <option key={p} value={p}>{p}</option>)
            )}
          </select>
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
        <label htmlFor="embosser-driver">Embosser Driver Model</label>
        <select
          id="embosser-driver"
          value={selectedDriverId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => handleDriverSelect(e.target.value)}
          style={{ padding: '0.4rem' }}
        >
          {EMBOSSER_LIST.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {renderViewPlusNotice()}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
        <label>Pages to Print</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', fontSize: '0.9rem' }}>
            <input
              type="radio"
              value="all"
              checked={printRange === 'all'}
              onChange={() => setPrintRange('all')}
              style={{ marginRight: '0.3rem' }}
            />
            All Pages
          </label>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', fontSize: '0.9rem', marginLeft: '1rem' }}>
            <input
              type="radio"
              value="custom"
              checked={printRange === 'custom'}
              onChange={() => setPrintRange('custom')}
              style={{ marginRight: '0.3rem' }}
            />
            Custom
          </label>
          {printRange === 'custom' && (
            <input
              type="text"
              placeholder="e.g. 1-5, 8, 11-13"
              value={customRange}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomRange(e.target.value)}
              style={{ padding: '0.3rem', width: '150px' }}
              aria-label="Custom page range"
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={handlePrint}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
        >
          {status === 'printing' ? 'Printing...' : useWebUSB ? 'Select Embosser & Print' : 'Print'}
        </button>
        <button
          onClick={handlePrintBoundaryTest}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
          style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
        >
          Print Boundary Test
        </button>
        
        {bridgeConnected && !useWebUSB && (
          <button
            onClick={() => window.open('http://127.0.0.1:8080/debug', '_blank')}
            style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
          >
            Debug Dashboard
          </button>
        )}
      </div>

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

export function generateBoundaryTestBrf(width: number, height: number): string {
  let brf = '';
  for (let r = 0; r < height; r++) {
    let line = '';
    if (r === 0) {
      line += '  ';
      for (let c = 3; c <= width; c++) {
        const tens = Math.floor(c / 10);
        line += tens > 0 ? tens.toString() : ' ';
      }
    } else if (r === 1) {
      line += '  ';
      for (let c = 3; c <= width; c++) {
        line += (c % 10).toString();
      }
    } else {
      const rowNum = r + 1;
      const tens = Math.floor(rowNum / 10);
      line += tens > 0 ? tens.toString() : ' ';
      line += (rowNum % 10).toString();

      for (let c = 3; c <= width; c++) {
        const isBorder = (r === 2 || r === height - 1 || c === 3 || c === width);
        line += isBorder ? '=' : ' ';
      }
    }
    brf += line;
    if (r < height - 1) {
      brf += '\r\n';
    }
  }
  return brf;
}
