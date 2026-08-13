import { useState, useEffect, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { printBrf, getPrinters, BRIDGE_DEBUG_URL, BRIDGE_SETTINGS_URL, type PrintTarget } from '../services/bridge-client';
import { printBrfWebUSB, WebUsbPrintError, USB_SESSION_EVENT, USB_ATTEMPT_EVENT, getUsbSessionSnapshot } from '../services/webusb-client';
import { webUsbDebug } from '../services/webusb-debug';
import { EmbosserFactory, EMBOSSER_LIST } from '../services/embossers/EmbosserFactory';
import { isMac, isWindows } from '../utils/os';

/** Maps known embosser driver ids to their `print.drivers.*` translation keys. */
const EMBOSSER_ID_TO_TRANSLATION_KEY: Record<string, string> = {
  generic: 'print.drivers.genericFallback',
  'enabling-romeo': 'print.drivers.enablingTechnologies',
  'index-basic': 'print.drivers.indexBraille',
  'braillo-200': 'print.drivers.braillo',
  'aph-pageblaster': 'print.drivers.aphPageBlaster',
  'aph-pixblaster': 'print.drivers.aphPixBlaster',
  'viewplus-embraille': 'print.drivers.viewPlusEmBraille',
  viewplus: 'print.drivers.viewPlusFamily',
};

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
  const { t } = useTranslation();

  function printErrorMessage(err: unknown): string {
    if (err instanceof WebUsbPrintError && err.kind === 'access-denied') {
      webUsbDebug.setEnabled(true);
      return t('print.errors.usbAccessDenied');
    }
    return err instanceof Error ? err.message : t('print.errors.unknown');
  }
  const embosserDisplayName = (id: string, fallbackName: string): string => {
    const key = EMBOSSER_ID_TO_TRANSLATION_KEY[id];
    return key ? t(key) : fallbackName;
  };
  const [printerName, setPrinterName] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('generic');
  const [status, setStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [availablePrinters, setAvailablePrinters] = useState<PrintTarget[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [printRange, setPrintRange] = useState<'all' | 'custom'>('all');
  const [customRange, setCustomRange] = useState('');
  const [usbHeld, setUsbHeld] = useState(() => getUsbSessionSnapshot().opened);

  useEffect(() => {
    if (!useWebUSB) return;
    const sync = () => setUsbHeld(getUsbSessionSnapshot().opened);
    sync();
    window.addEventListener(USB_SESSION_EVENT, sync);
    window.addEventListener(USB_ATTEMPT_EVENT, sync);
    return () => {
      window.removeEventListener(USB_SESSION_EVENT, sync);
      window.removeEventListener(USB_ATTEMPT_EVENT, sync);
    };
  }, [useWebUSB]);

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
          handlePrinterSelect(printers[0].id, printers[0]);
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

  function handlePrinterSelect(id: string, targetHint?: PrintTarget) {
    setPrinterName(id);
    const target = targetHint ?? availablePrinters.find(p => p.id === id);
    const lower = (target?.printer || target?.name || id).toLowerCase();
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
      setErrorMsg(t('print.errors.enterPrinterName'));
      return;
    }
    if (!brf) {
      setErrorMsg(t('print.errors.noContent'));
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
          setErrorMsg(t('print.errors.invalidRange'));
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
      setErrorMsg(printErrorMessage(err));
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
      setErrorMsg(printErrorMessage(err));
    }
  }

  const renderViewPlusNotice = () => {
    if (selectedDriverId !== 'viewplus' && selectedDriverId !== 'viewplus-embraille') return null;

    const style = { fontSize: '0.8rem', marginTop: '0.4rem', lineHeight: 1.35 };

    return (
      <div style={compact ? { flexBasis: '100%', marginTop: '0.35rem' } : undefined}>
        <div style={{ ...style, color: '#0369a1' }}>
          {t('print.viewPlusNotice.body')}
        </div>
        {isWindows() || isMac() ? (
          <div style={{ ...style, color: '#0369a1' }}>
            {t('print.viewPlusNotice.driver')}
          </div>
        ) : null}

      </div>
    );
  };

  if (compact) {
    return (
      <div className="print-panel-compact">
        {!useWebUSB && !bridgeConnected && (
          <span className="bridge-badge" role="status">{t('print.compact.bridgeOffline')}</span>
        )}
        {!useWebUSB && (
          <>
            <label htmlFor="printer-name-compact">{t('print.compact.printer')}</label>
            <select
              id="printer-name-compact"
              className="printer-input"
              value={printerName}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => handlePrinterSelect(e.target.value)}
              disabled={!bridgeConnected || isLoadingPrinters}
            >
              {isLoadingPrinters ? (
                <option>{t('print.compact.loading')}</option>
              ) : availablePrinters.length === 0 ? (
                <option value="">{t('print.compact.noPrintersFound')}</option>
              ) : (
                availablePrinters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
              )}
            </select>
          </>
        )}
        <select
          className="printer-input"
          aria-label={t('print.compact.driverAriaLabel')}
          value={selectedDriverId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => handleDriverSelect(e.target.value)}
          style={{ width: '130px', marginLeft: '0.4rem' }}
        >
          {EMBOSSER_LIST.map(e => <option key={e.id} value={e.id}>{embosserDisplayName(e.id, e.name)}</option>)}
        </select>
        <select
          className="printer-input"
          aria-label={t('print.compact.rangeAriaLabel')}
          value={printRange}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setPrintRange(e.target.value as 'all' | 'custom')}
          style={{ width: '80px', marginLeft: '0.4rem' }}
        >
          <option value="all">{t('print.compact.allPages')}</option>
          <option value="custom">{t('print.compact.custom')}</option>
        </select>
        {printRange === 'custom' && (
          <input
            type="text"
            className="printer-input"
            placeholder={t('print.compact.customPlaceholder')}
            value={customRange}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomRange(e.target.value)}
            style={{ width: '80px', marginLeft: '0.4rem' }}
            aria-label={t('print.compact.customRangeAriaLabel')}
          />
        )}
        <button
          className="toolbar-btn toolbar-btn--primary"
          onClick={handlePrint}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
        >
          {status === 'printing' ? t('print.compact.sending') : useWebUSB ? (usbHeld ? t('print.compact.print') : t('print.compact.selectAndPrint')) : t('print.compact.print')}
        </button>
        <button
          className="toolbar-btn"
          onClick={handlePrintBoundaryTest}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
          title={t('print.compact.boundaryTest.title')}
          style={{ marginLeft: '0.4rem', border: '1px solid #cbd5e1' }}
        >
          {t('print.compact.boundaryTest.label')}
        </button>
        {useWebUSB && (
          <button
            className="toolbar-btn"
            onClick={() => webUsbDebug.setEnabled(true)}
            title={t('print.compact.debug.usbTitle')}
            style={{ marginLeft: '0.4rem', border: '1px solid #cbd5e1' }}
          >
            {t('print.compact.debug.label')}
          </button>
        )}
        {bridgeConnected && !useWebUSB && (
          <>
            <button
              className="toolbar-btn"
              onClick={() => window.open(BRIDGE_SETTINGS_URL, '_blank')}
              title={t('print.compact.settings.title')}
              style={{ marginLeft: '0.4rem', border: '1px solid #cbd5e1' }}
            >
              {t('print.compact.settings.label')}
            </button>
            <button
              className="toolbar-btn"
              onClick={() => window.open(BRIDGE_DEBUG_URL, '_blank')}
              title={t('print.compact.debug.title')}
              style={{ marginLeft: '0.4rem', border: '1px solid #cbd5e1' }}
            >
              {t('print.compact.debug.label')}
            </button>
          </>
        )}
        {renderViewPlusNotice()}
        {status === 'success' && (
          <span className="print-status-ok" aria-live="polite">{t('print.compact.sent')}</span>
        )}
        {(status === 'error' || (errorMsg && status === 'idle')) && (
          <span className="print-status-err" role="alert">{errorMsg}</span>
        )}
      </div>
    );
  }

  return (
    <div className="print-panel">
      <h3>{useWebUSB ? t('print.full.webUsbHeading') : t('print.full.heading')}</h3>

      {!useWebUSB && !bridgeConnected && (
        <p className="bridge-warning" role="status">
          {t('print.full.bridgeNotConnected')}
        </p>
      )}
      {bridgeConnected && !useWebUSB && (
        <p className="bridge-hint" role="note" style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-secondary, #666)' }}>
          {t('print.full.sharedHint')}
        </p>
      )}

      {useWebUSB ? (
        <p className="webusb-info" style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#666' }}>
          {t('print.full.selectSecurely')}
        </p>
      ) : (
        <>
          <label htmlFor="printer-name">{t('print.full.selectPrinter')}</label>
          <select
            id="printer-name"
            value={printerName}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => handlePrinterSelect(e.target.value)}
            disabled={!bridgeConnected || isLoadingPrinters}
            style={{ padding: '0.4rem', marginBottom: '1rem' }}
          >
            {isLoadingPrinters ? (
              <option>{t('print.compact.loading')}</option>
            ) : availablePrinters.length === 0 ? (
              <option value="">{t('print.full.noPrintersFound')}</option>
            ) : (
              availablePrinters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
            )}
          </select>
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
        <label htmlFor="embosser-driver">{t('print.full.driverModel')}</label>
        <select
          id="embosser-driver"
          value={selectedDriverId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => handleDriverSelect(e.target.value)}
          style={{ padding: '0.4rem' }}
        >
          {EMBOSSER_LIST.map(e => <option key={e.id} value={e.id}>{embosserDisplayName(e.id, e.name)}</option>)}
        </select>
        {renderViewPlusNotice()}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
        <label>{t('print.full.pagesToPrint')}</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', fontSize: '0.9rem' }}>
            <input
              type="radio"
              value="all"
              checked={printRange === 'all'}
              onChange={() => setPrintRange('all')}
              style={{ marginRight: '0.3rem' }}
            />
            {t('print.full.allPages')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', fontSize: '0.9rem', marginLeft: '1rem' }}>
            <input
              type="radio"
              value="custom"
              checked={printRange === 'custom'}
              onChange={() => setPrintRange('custom')}
              style={{ marginRight: '0.3rem' }}
            />
            {t('print.full.custom')}
          </label>
          {printRange === 'custom' && (
            <input
              type="text"
              placeholder={t('print.full.customPlaceholder')}
              value={customRange}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomRange(e.target.value)}
              style={{ padding: '0.3rem', width: '150px' }}
              aria-label={t('print.compact.customRangeAriaLabel')}
            />
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={handlePrint}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
        >
          {status === 'printing' ? t('print.full.printing') : useWebUSB ? (usbHeld ? t('print.full.print') : t('print.full.selectEmbosserAndPrint')) : t('print.full.print')}
        </button>
        <button
          onClick={handlePrintBoundaryTest}
          disabled={(!useWebUSB && !bridgeConnected) || status === 'printing'}
          style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
        >
          {t('print.full.printBoundaryTest')}
        </button>
        
        {useWebUSB && (
          <button
            onClick={() => webUsbDebug.setEnabled(true)}
            title={t('print.compact.debug.usbTitle')}
            style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
          >
            {t('print.full.usbDebugDashboard')}
          </button>
        )}
        {bridgeConnected && !useWebUSB && (
          <>
            <button
              onClick={() => window.open(BRIDGE_SETTINGS_URL, '_blank')}
              title={t('print.full.bridgeSettingsTitle')}
              style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
            >
              {t('print.full.bridgeSettings')}
            </button>
            <button
              onClick={() => window.open(BRIDGE_DEBUG_URL, '_blank')}
              style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
            >
              {t('print.full.debugDashboard')}
            </button>
          </>
        )}
      </div>

      {status === 'success' && (
        <p className="status-ok" aria-live="polite">{t('print.full.sentSuccess')}</p>
      )}
      {status === 'error' && (
        <p className="status-err" role="alert">{t('print.full.errorPrefix', { error: errorMsg })}</p>
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
