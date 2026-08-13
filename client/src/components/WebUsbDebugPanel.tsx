/**
 * Website-only WebUSB debug panel for ChromeOS (no Bridge).
 *
 * Hidden unless enabled via Ctrl+Shift+Alt+U, ?usbDebug=1, localStorage,
 * or the Print bar Debug button when WebUSB is active.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  USB_ATTEMPT_EVENT,
  forgetAuthorizedUsbDevices,
  getLastUsbAttempt,
  getUsbEnvironment,
  listAuthorizedUsbDevices,
  probeUsbDevice,
  requestUsbDeviceForDebug,
  type UsbAttemptLog,
  type UsbDeviceSummary,
  type UsbEnvironmentSnapshot,
} from '../services/webusb-client';
import {
  formatUsbDebugExportJson,
  webUsbDebug,
} from '../services/webusb-debug';
import './WebUsbDebugPanel.css';

function downloadJson(json: string, capturedAt: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `usb-debug-${capturedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyJson(json: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = json;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function deviceLabel(device: UsbDeviceSummary): string {
  const name = device.productName || device.manufacturerName || 'USB device';
  return `${name} ${device.vendorIdHex}:${device.productIdHex}`;
}

export function WebUsbDebugPanel() {
  const [enabled, setEnabled] = useState(() => webUsbDebug.isEnabled());
  const [minimized, setMinimized] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [env, setEnv] = useState<UsbEnvironmentSnapshot>(() => getUsbEnvironment());
  const [authorized, setAuthorized] = useState<UsbDeviceSummary[]>([]);
  const [lastAttempt, setLastAttempt] = useState<UsbAttemptLog | null>(() => getLastUsbAttempt());

  const refresh = useCallback(async () => {
    setEnv(getUsbEnvironment());
    setLastAttempt(getLastUsbAttempt());
    try {
      setAuthorized(await listAuthorizedUsbDevices());
    } catch {
      setAuthorized([]);
    }
  }, []);

  useEffect(() => {
    return webUsbDebug.subscribe(() => {
      setEnabled(webUsbDebug.isEnabled());
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        webUsbDebug.toggle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onAttempt() {
      setLastAttempt(getLastUsbAttempt());
    }
    window.addEventListener(USB_ATTEMPT_EVENT, onAttempt);
    return () => window.removeEventListener(USB_ATTEMPT_EVENT, onAttempt);
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const handleCopy = useCallback(async () => {
    const ok = await copyJson(formatUsbDebugExportJson(authorized));
    setCopyMsg(ok ? 'Copied USB debug JSON' : 'Copy failed — try Download');
    window.setTimeout(() => setCopyMsg(null), 2500);
  }, [authorized]);

  const handleDownload = useCallback(() => {
    const json = formatUsbDebugExportJson(authorized);
    downloadJson(json, new Date().toISOString());
    setCopyMsg('Downloaded USB debug JSON');
    window.setTimeout(() => setCopyMsg(null), 2500);
  }, [authorized]);

  const run = useCallback(async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      setCopyMsg(done);
      window.setTimeout(() => setCopyMsg(null), 2500);
    } catch (err) {
      setCopyMsg(err instanceof Error ? err.message : 'USB action failed');
      window.setTimeout(() => setCopyMsg(null), 4000);
    } finally {
      setLastAttempt(getLastUsbAttempt());
      try {
        setAuthorized(await listAuthorizedUsbDevices());
      } catch {
        /* keep previous list */
      }
      setBusy(false);
    }
  }, []);

  if (!enabled) return null;

  const accessDenied = lastAttempt?.errorKind === 'access-denied';
  const showChromeHelp = env.chromeOS || accessDenied;

  return (
    <aside
      className={`usb-debug${minimized ? ' usb-debug--min' : ''}`}
      role="complementary"
      aria-label="WebUSB debug"
    >
      <header className="usb-debug__header">
        <strong className="usb-debug__title">WebUSB Debug</strong>
        <span className="usb-debug__hint">Ctrl+Shift+Alt+U</span>
        <div className="usb-debug__header-actions">
          <button
            type="button"
            className="usb-debug__icon-btn"
            onClick={() => setMinimized((v) => !v)}
            aria-label={minimized ? 'Expand WebUSB debug' : 'Minimize WebUSB debug'}
          >
            {minimized ? '▴' : '▾'}
          </button>
          <button
            type="button"
            className="usb-debug__icon-btn"
            onClick={() => webUsbDebug.setEnabled(false)}
            aria-label="Close WebUSB debug"
          >
            ✕
          </button>
        </div>
      </header>

      {!minimized && (
        <div className="usb-debug__body">
          <section className="usb-debug__section">
            <h3>Environment</h3>
            <ul className="usb-debug__kv">
              <li><span>ChromeOS</span><span>{env.chromeOS ? 'yes' : 'no'}</span></li>
              <li><span>WebUSB</span><span>{env.webUsb ? 'yes' : 'no'}</span></li>
              <li><span>HTTPS</span><span>{env.secureContext ? 'yes' : 'no'} ({env.protocol})</span></li>
              <li><span>Host</span><span>{env.host || '—'}</span></li>
            </ul>
          </section>

          {showChromeHelp && (
            <section className="usb-debug__section">
              <h3>Access Denied on ChromeOS</h3>
              <p className="usb-debug__help">
                ChromeOS often claims the embosser as a system printer, so
                {' '}<code>device.open()</code> fails with Access Denied even after you pick it.
                Remove the embosser under <strong>Settings → Print → Printers</strong>,
                unplug and replug USB, dismiss any printer setup prompt, then Probe again.
                If Linux (Crostini) is sharing the USB device, turn that off too.
              </p>
            </section>
          )}

          <section className="usb-debug__section">
            <h3>Authorized devices</h3>
            {authorized.length === 0 ? (
              <p className="usb-debug__muted">None yet — use Request or Probe (needs a click).</p>
            ) : (
              <ul className="usb-debug__log">
                {authorized.map((d) => (
                  <li key={`${d.vendorIdHex}:${d.productIdHex}:${d.serialNumber ?? ''}`}>
                    {deviceLabel(d)}
                    {d.printerClass ? ' · printer class' : ''}
                    {d.opened ? ' · open' : ''}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="usb-debug__section">
            <h3>Last attempt</h3>
            {!lastAttempt ? (
              <p className="usb-debug__muted">No print or probe yet this session.</p>
            ) : (
              <>
                <ul className="usb-debug__kv">
                  <li><span>Kind</span><span>{lastAttempt.kind}</span></li>
                  <li><span>When</span><span>{lastAttempt.at}</span></li>
                  {lastAttempt.device && (
                    <li>
                      <span>Device</span>
                      <span>
                        {deviceLabel(lastAttempt.device)}
                        {lastAttempt.device.printerClass ? ' · printer class' : ''}
                      </span>
                    </li>
                  )}
                  {lastAttempt.error && (
                    <li><span>Error</span><span className="usb-debug__err">{lastAttempt.error}</span></li>
                  )}
                </ul>
                <ol className={`usb-debug__log${accessDenied ? ' usb-debug__log--warn' : ''}`}>
                  {lastAttempt.steps.map((step, i) => (
                    <li key={`${step.name}-${i}`}>
                      {step.ok ? 'ok' : 'fail'} {step.name}
                      {step.detail ? `: ${step.detail}` : ''}
                    </li>
                  ))}
                </ol>
                {lastAttempt.device?.configurations.map((cfg) => (
                  <div key={cfg.configurationValue} className="usb-debug__cfg">
                    <p className="usb-debug__muted">
                      Config {cfg.configurationValue}
                      {cfg.configurationName ? ` (${cfg.configurationName})` : ''}
                    </p>
                    {cfg.interfaces.map((intf) =>
                      intf.alternates.map((alt) => (
                        <p key={`${intf.interfaceNumber}-${alt.alternateSetting}`} className="usb-debug__muted">
                          iface {intf.interfaceNumber} alt {alt.alternateSetting}: {alt.interfaceClassLabel}
                          {alt.endpoints.length
                            ? ` · ${alt.endpoints.map((ep) => `${ep.type} ${ep.direction} ep${ep.endpointNumber}`).join(', ')}`
                            : ''}
                        </p>
                      )),
                    )}
                  </div>
                ))}
              </>
            )}
          </section>

          <div className="usb-debug__actions">
            <button type="button" className="toolbar-btn" disabled={busy} onClick={() => void run(requestUsbDeviceForDebug, 'Device authorized')}>
              Request
            </button>
            <button type="button" className="toolbar-btn" disabled={busy} onClick={() => void run(probeUsbDevice, 'Probe finished')}>
              Probe
            </button>
            <button type="button" className="toolbar-btn" disabled={busy} onClick={() => void refresh()}>
              Refresh
            </button>
            <button
              type="button"
              className="toolbar-btn"
              disabled={busy}
              onClick={() => void run(async () => {
                const n = await forgetAuthorizedUsbDevices();
                return n;
              }, 'Forgot authorized devices')}
            >
              Forget
            </button>
            <button type="button" className="toolbar-btn" onClick={() => void handleCopy()}>
              Copy JSON
            </button>
            <button type="button" className="toolbar-btn" onClick={handleDownload}>
              Download
            </button>
          </div>
          {copyMsg ? <p className="usb-debug__toast">{copyMsg}</p> : null}
          <p className="usb-debug__footer">
            Website-only USB diagnostics. Probe opens, claims a bulk-out interface, then releases — it does not print.
          </p>
        </div>
      )}
    </aside>
  );
}
