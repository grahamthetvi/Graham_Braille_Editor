/**
 * Website-only WebUSB debug panel (ChromeOS / no Bridge).
 *
 * Enable with any of:
 * - URL `?usbDebug=1`
 * - localStorage `graham.usbDebug=1`
 * - Ctrl+Shift+Alt+U (toggles)
 * - Print bar Debug button when WebUSB is active
 */

import {
  getLastUsbAttempt,
  getUsbEnvironment,
  type UsbAttemptLog,
  type UsbDeviceSummary,
  type UsbEnvironmentSnapshot,
} from './webusb-client';

export const USB_DEBUG_STORAGE_KEY = 'graham.usbDebug';

type Listener = () => void;

const listeners = new Set<Listener>();

function readEnabledFromEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem(USB_DEBUG_STORAGE_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('usbDebug') === '1' || q.get('usbDebug') === 'true') return true;
  } catch {
    /* ignore */
  }
  return false;
}

let enabled = readEnabledFromEnvironment();

function notify(): void {
  for (const listener of listeners) listener();
}

export function isUsbDebugEnabled(): boolean {
  return enabled;
}

export function setUsbDebugEnabled(next: boolean): void {
  enabled = next;
  try {
    if (typeof window !== 'undefined') {
      if (next) window.localStorage.setItem(USB_DEBUG_STORAGE_KEY, '1');
      else window.localStorage.removeItem(USB_DEBUG_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
  notify();
}

export function toggleUsbDebug(): void {
  setUsbDebugEnabled(!enabled);
}

export function subscribeUsbDebug(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface UsbDebugExport {
  v: 1;
  at: string;
  env: UsbEnvironmentSnapshot;
  lastAttempt: UsbAttemptLog | null;
  authorized: UsbDeviceSummary[];
}

export function buildUsbDebugExport(authorized: UsbDeviceSummary[] = []): UsbDebugExport {
  return {
    v: 1,
    at: new Date().toISOString(),
    env: getUsbEnvironment(),
    lastAttempt: getLastUsbAttempt(),
    authorized,
  };
}

export function formatUsbDebugExportJson(authorized: UsbDeviceSummary[] = []): string {
  return JSON.stringify(buildUsbDebugExport(authorized));
}

export const webUsbDebug = {
  isEnabled: isUsbDebugEnabled,
  setEnabled: setUsbDebugEnabled,
  toggle: toggleUsbDebug,
  subscribe: subscribeUsbDebug,
};
