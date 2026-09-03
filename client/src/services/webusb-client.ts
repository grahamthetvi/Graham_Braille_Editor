/**
 * WebUSB Client — communicates directly with connected braille embossers
 * via the browser's WebUSB API (`navigator.usb`).
 *
 * Specifically designed for ChromeOS where local Go binaries cannot run.
 */

import { isChromeOS, supportsWebUSB } from '../utils/os';

export type WebUsbErrorKind =
    | 'unsupported'
    | 'not-selected'
    | 'access-denied'
    | 'no-configuration'
    | 'no-endpoint'
    | 'claim-failed'
    | 'transfer-failed'
    | 'unknown';

export class WebUsbPrintError extends Error {
    readonly kind: WebUsbErrorKind;
    readonly rawMessage: string;

    constructor(kind: WebUsbErrorKind, message: string, rawMessage = '') {
        super(message);
        this.name = 'WebUsbPrintError';
        this.kind = kind;
        this.rawMessage = rawMessage;
    }
}

export interface UsbEndpointSummary {
    endpointNumber: number;
    direction: string;
    type: string;
    packetSize: number;
}

export interface UsbAlternateSummary {
    alternateSetting: number;
    interfaceClass: number;
    interfaceClassLabel: string;
    interfaceSubclass: number;
    interfaceProtocol: number;
    interfaceName?: string;
    endpoints: UsbEndpointSummary[];
}

export interface UsbInterfaceSummary {
    interfaceNumber: number;
    claimed: boolean;
    alternates: UsbAlternateSummary[];
}

export interface UsbConfigurationSummary {
    configurationValue: number;
    configurationName?: string;
    interfaces: UsbInterfaceSummary[];
}

export interface UsbDeviceSummary {
    vendorId: number;
    productId: number;
    vendorIdHex: string;
    productIdHex: string;
    productName?: string;
    manufacturerName?: string;
    serialNumber?: string;
    deviceClass: number;
    deviceClassLabel: string;
    deviceSubclass: number;
    deviceProtocol: number;
    opened: boolean;
    printerClass: boolean;
    configurations: UsbConfigurationSummary[];
}

export interface UsbBulkOutTarget {
    configurationValue?: number;
    interfaceNumber: number;
    endpointNumber: number;
}

export interface UsbAttemptStep {
    name: string;
    ok: boolean;
    detail?: string;
}

export interface UsbAttemptLog {
    at: string;
    kind: 'print' | 'probe' | 'list' | 'request';
    steps: UsbAttemptStep[];
    device: UsbDeviceSummary | null;
    errorKind?: WebUsbErrorKind;
    error?: string;
}

export interface UsbEnvironmentSnapshot {
    chromeOS: boolean;
    webUsb: boolean;
    secureContext: boolean;
    protocol: string;
    host: string;
    userAgent: string;
}

export interface UsbDeviceLike {
    opened?: boolean;
    vendorId: number;
    productId: number;
    productName?: string;
    manufacturerName?: string;
    serialNumber?: string;
    deviceClass?: number;
    deviceSubclass?: number;
    deviceProtocol?: number;
    configuration?: { configurationValue: number } | null;
    configurations?: Array<{
        configurationValue: number;
        configurationName?: string;
        interfaces: Array<{
            interfaceNumber: number;
            claimed?: boolean;
            alternates: Array<{
                alternateSetting: number;
                interfaceClass: number;
                interfaceSubclass: number;
                interfaceProtocol: number;
                interfaceName?: string;
                endpoints: Array<{
                    endpointNumber: number;
                    direction: string;
                    type: string;
                    packetSize: number;
                }>;
            }>;
        }>;
    }>;
}

export interface UsbHardwareDevice extends UsbDeviceLike {
    opened: boolean;
    configuration: { configurationValue: number } | null;
    configurations: NonNullable<UsbDeviceLike['configurations']>;
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(value: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    releaseInterface(interfaceNumber: number): Promise<void>;
    transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status: string }>;
    forget?(): Promise<void>;
}

export interface UsbConnectionEventLike {
    device: UsbHardwareDevice;
}

export interface UsbHardwareBus {
    requestDevice(options: { filters: unknown[] }): Promise<UsbHardwareDevice>;
    getDevices(): Promise<UsbHardwareDevice[]>;
    addEventListener?(
        type: 'connect' | 'disconnect',
        listener: (event: UsbConnectionEventLike) => void | Promise<void>,
    ): void;
    removeEventListener?(
        type: 'connect' | 'disconnect',
        listener: (event: UsbConnectionEventLike) => void,
    ): void;
}

export interface UsbSessionSnapshot {
    held: boolean;
    opened: boolean;
    claimed: boolean;
    grabOnConnect: boolean;
    device: UsbDeviceSummary | null;
}

const USB_CLASS_LABELS: Record<number, string> = {
    0: 'Interface-defined',
    1: 'Audio',
    2: 'CDC / Communications',
    3: 'HID',
    7: 'Printer',
    8: 'Mass Storage',
    9: 'Hub',
    10: 'CDC-Data',
    11: 'Smart Card',
    14: 'Video',
    224: 'Wireless',
    255: 'Vendor-specific',
};

export const VIEWPLUS_VENDOR_ID = 0x12f2;

export const USB_ACCESS_DENIED_HELP =
    'USB Access Denied: ChromeOS claimed this USB printer (the ViewPlus Max is printer-class 7/1/2). ChromeOS can own the port even when Settings → Print → Printers shows nothing saved — printscanmgr / the USB printer detector probes IEEE-1284 ID and keeps the handle. Probe and Forget cannot steal it back. Keep this Graham tab focused. Unplug the Max for 10+ seconds, check chrome://os-settings/cupsPrinters for hidden automatic or discovered printers and remove them while unplugged, then plug back in with this tab already open and wait until Debug shows Held/Opened before Print. After it works, do not unplug and do not close this tab.';

export const USB_ATTEMPT_EVENT = 'graham-usb-attempt';
export const USB_SESSION_EVENT = 'graham-usb-session';

/** Print / authorized open budget (~2s). ChromeOS 1284 probes often outlast a weaker retry. */
export const USB_OPEN_RETRY_TRIES = 25;
export const USB_OPEN_RETRY_MS = 80;
/** Plug-in / visibility grab budget (~3.2s) to beat printscanmgr claiming class-7. */
export const USB_CONNECT_RETRY_TRIES = 40;

let lastAttempt: UsbAttemptLog | null = null;
let testBusOverride: UsbHardwareBus | null | undefined;
let retryTriesOverride: number | undefined;
let retryDelayMsOverride: number | undefined;
let visibilityListenerAttached = false;

function openRetryTries(): number {
    return retryTriesOverride ?? USB_OPEN_RETRY_TRIES;
}

function openRetryDelayMs(): number {
    return retryDelayMsOverride ?? USB_OPEN_RETRY_MS;
}

function connectRetryTries(): number {
    return retryTriesOverride ?? USB_CONNECT_RETRY_TRIES;
}

/** Test-only: inject a fake `navigator.usb`. Pass `null` to simulate no WebUSB. */
export function setUsbHardwareBusForTests(bus: UsbHardwareBus | null | undefined): void {
    testBusOverride = bus;
}

/** Test-only: shorten or lengthen open retries without waiting on real timers. */
export function setUsbOpenRetryForTests(opts: { tries?: number; delayMs?: number } | null): void {
    if (!opts) {
        retryTriesOverride = undefined;
        retryDelayMsOverride = undefined;
        return;
    }
    if (opts.tries != null) retryTriesOverride = opts.tries;
    if (opts.delayMs != null) retryDelayMsOverride = opts.delayMs;
}

/** Test-only: drop the held session, listeners flag, and bus override. */
export function resetUsbClientForTests(): void {
    held = null;
    holderStarted = false;
    usbListenersAttached = false;
    visibilityListenerAttached = false;
    lastAttempt = null;
    testBusOverride = undefined;
    retryTriesOverride = undefined;
    retryDelayMsOverride = undefined;
}

export function getLastUsbAttempt(): UsbAttemptLog | null {
    return lastAttempt;
}

export function recordUsbAttempt(attempt: UsbAttemptLog): void {
    lastAttempt = attempt;
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(USB_ATTEMPT_EVENT));
    }
}

export function toUsbHexId(id: number): string {
    return `0x${id.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function usbClassLabel(classCode: number): string {
    return USB_CLASS_LABELS[classCode] ?? `Class ${classCode}`;
}

export function errorMessageOf(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    return String(err);
}

export function errorNameOf(err: unknown): string {
    if (err instanceof Error && err.name) return err.name;
    return '';
}

export function isUsbAccessDenied(err: unknown): boolean {
    const msg = errorMessageOf(err);
    const name = errorNameOf(err);
    if (/access\s*denied/i.test(msg)) return true;
    if (name === 'SecurityError' && /USBDevice|\bopen\b|claimInterface/i.test(msg)) return true;
    return false;
}

export function classifyWebUsbError(err: unknown): WebUsbErrorKind {
    const msg = errorMessageOf(err);
    if (isUsbAccessDenied(err)) return 'access-denied';
    if (/no device selected|permission denied/i.test(msg)) return 'not-selected';
    if (/not supported/i.test(msg)) return 'unsupported';
    if (/configuration/i.test(msg)) return 'no-configuration';
    if (/bulk output endpoint/i.test(msg)) return 'no-endpoint';
    if (/claim/i.test(msg)) return 'claim-failed';
    if (/transfer failed/i.test(msg)) return 'transfer-failed';
    return 'unknown';
}

export function wrapWebUsbError(err: unknown): WebUsbPrintError {
    if (err instanceof WebUsbPrintError) return err;
    const kind = classifyWebUsbError(err);
    const raw = errorMessageOf(err);
    const message =
        kind === 'access-denied'
            ? USB_ACCESS_DENIED_HELP
            : kind === 'not-selected'
              ? 'No device selected or permission denied.'
              : raw || 'Unknown USB error.';
    return new WebUsbPrintError(kind, message, raw);
}

export function summarizeUsbDevice(device: UsbDeviceLike): UsbDeviceSummary {
    const deviceClass = device.deviceClass ?? 0;
    const configurations = (device.configurations ?? []).map((cfg) => ({
        configurationValue: cfg.configurationValue,
        configurationName: cfg.configurationName,
        interfaces: cfg.interfaces.map((intf) => ({
            interfaceNumber: intf.interfaceNumber,
            claimed: Boolean(intf.claimed),
            alternates: intf.alternates.map((alt) => ({
                alternateSetting: alt.alternateSetting,
                interfaceClass: alt.interfaceClass,
                interfaceClassLabel: usbClassLabel(alt.interfaceClass),
                interfaceSubclass: alt.interfaceSubclass,
                interfaceProtocol: alt.interfaceProtocol,
                interfaceName: alt.interfaceName,
                endpoints: alt.endpoints.map((ep) => ({
                    endpointNumber: ep.endpointNumber,
                    direction: ep.direction,
                    type: ep.type,
                    packetSize: ep.packetSize,
                })),
            })),
        })),
    }));

    const printerClass =
        deviceClass === 7 ||
        configurations.some((cfg) =>
            cfg.interfaces.some((intf) => intf.alternates.some((alt) => alt.interfaceClass === 7)),
        );

    return {
        vendorId: device.vendorId,
        productId: device.productId,
        vendorIdHex: toUsbHexId(device.vendorId),
        productIdHex: toUsbHexId(device.productId),
        productName: device.productName,
        manufacturerName: device.manufacturerName,
        serialNumber: device.serialNumber,
        deviceClass,
        deviceClassLabel: usbClassLabel(deviceClass),
        deviceSubclass: device.deviceSubclass ?? 0,
        deviceProtocol: device.deviceProtocol ?? 0,
        opened: Boolean(device.opened),
        printerClass,
        configurations,
    };
}

export function findBulkOutEndpoint(device: UsbDeviceLike): UsbBulkOutTarget | null {
    const configs = device.configurations ?? [];
    const preferredValue = device.configuration?.configurationValue;
    const ordered = [...configs].sort((a, b) => {
        if (preferredValue == null) return 0;
        if (a.configurationValue === preferredValue) return -1;
        if (b.configurationValue === preferredValue) return 1;
        return 0;
    });

    for (const cfg of ordered) {
        for (const intf of cfg.interfaces) {
            for (const alt of intf.alternates) {
                for (const ep of alt.endpoints) {
                    if (ep.direction === 'out' && ep.type === 'bulk') {
                        return {
                            configurationValue: cfg.configurationValue,
                            interfaceNumber: intf.interfaceNumber,
                            endpointNumber: ep.endpointNumber,
                        };
                    }
                }
            }
        }
    }
    return null;
}

export function getUsbEnvironment(): UsbEnvironmentSnapshot {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            chromeOS: false,
            webUsb: false,
            secureContext: false,
            protocol: '',
            host: '',
            userAgent: '',
        };
    }
    return {
        chromeOS: isChromeOS(),
        webUsb: supportsWebUSB(),
        secureContext: window.isSecureContext,
        protocol: window.location?.protocol ?? '',
        host: window.location?.host ?? '',
        userAgent: navigator.userAgent,
    };
}

export function selectPreferredUsbDevice<T extends UsbDeviceLike>(devices: T[]): T | undefined {
    if (devices.length === 0) return undefined;
    const viewplus = devices.find((d) => d.vendorId === VIEWPLUS_VENDOR_ID);
    if (viewplus) return viewplus;
    const printer = devices.find((d) => summarizeUsbDevice(d).printerClass);
    return printer ?? devices[0];
}

function sameUsbDevice(a: UsbDeviceLike, b: UsbDeviceLike): boolean {
    return a.vendorId === b.vendorId && a.productId === b.productId;
}

function pushStep(steps: UsbAttemptStep[], name: string, ok: boolean, detail?: string): void {
    steps.push(detail ? { name, ok, detail } : { name, ok });
}

function usbBus(): UsbHardwareBus | null {
    if (testBusOverride !== undefined) return testBusOverride;
    if (typeof navigator === 'undefined') return null;
    const usb = (navigator as Navigator & { usb?: UsbHardwareBus }).usb;
    return usb ?? null;
}

function chromeOsClass7OpenHint(tries: number, authorizedCount: number | null): string {
    const seconds = ((tries * openRetryDelayMs()) / 1000).toFixed(tries * openRetryDelayMs() % 1000 === 0 ? 0 : 1);
    const devices =
        authorizedCount == null
            ? ''
            : authorizedCount === 0
              ? ' getDevices() was empty (Forget or no site permission yet).'
              : ` getDevices() had ${authorizedCount} authorized device(s).`;
    return `Access Denied after ${tries} open tries (~${seconds}s).${devices} ChromeOS owns USB printer class 7 even with no saved printer.`;
}

function notifyUsbSession(): void {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(USB_SESSION_EVENT));
    }
}

interface HeldUsbSession {
    device: UsbHardwareDevice;
    target: UsbBulkOutTarget | null;
    claimed: boolean;
}

let held: HeldUsbSession | null = null;
let holderStarted = false;
let usbListenersAttached = false;

export function getUsbSessionSnapshot(): UsbSessionSnapshot {
    return {
        held: Boolean(held),
        opened: Boolean(held?.device.opened),
        claimed: Boolean(held?.claimed),
        grabOnConnect: holderStarted,
        device: held ? summarizeUsbDevice(held.device) : null,
    };
}

function clearHeld(device?: UsbDeviceLike): void {
    if (!held) return;
    if (device && !sameUsbDevice(held.device, device)) return;
    held = null;
    notifyUsbSession();
}

function heldIsUsable(): boolean {
    if (!held) return false;
    if (!held.device.opened) {
        held = null;
        notifyUsbSession();
        return false;
    }
    return true;
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestUsbDevice(): Promise<UsbHardwareDevice> {
    const usb = usbBus();
    if (!usb) {
        throw new WebUsbPrintError('unsupported', 'WebUSB is not supported in this browser.');
    }
    try {
        return await usb.requestDevice({ filters: [] });
    } catch (err) {
        if (isUsbAccessDenied(err)) throw wrapWebUsbError(err);
        throw new WebUsbPrintError('not-selected', 'No device selected or permission denied.', errorMessageOf(err));
    }
}

async function openUsbDevice(
    device: UsbHardwareDevice,
    steps: UsbAttemptStep[],
    tries = openRetryTries(),
    authorizedCount: number | null = null,
): Promise<void> {
    if (device.opened) {
        pushStep(steps, 'open', true, 'already open');
        return;
    }
    let lastErr: unknown;
    const attempts = Math.max(1, tries);
    for (let i = 0; i < attempts; i++) {
        try {
            await device.open();
            // Never close() after a failed open — ChromeOS would keep the class-7 fd.
            pushStep(steps, 'open', true, i === 0 ? undefined : `won race on retry ${i + 1}`);
            return;
        } catch (err) {
            lastErr = err;
            if (!isUsbAccessDenied(err)) {
                pushStep(steps, 'open', false, errorMessageOf(err));
                throw wrapWebUsbError(err);
            }
            if (i < attempts - 1) await sleep(openRetryDelayMs());
        }
    }
    // Failed open: do not call close(). The device was never ours.
    pushStep(steps, 'open', false, `${errorMessageOf(lastErr)}. ${chromeOsClass7OpenHint(attempts, authorizedCount)}`);
    throw wrapWebUsbError(lastErr);
}

async function ensureConfiguration(device: UsbHardwareDevice, steps: UsbAttemptStep[]): Promise<void> {
    if (device.configuration === null && device.configurations.length > 0) {
        const value = device.configurations[0].configurationValue;
        await device.selectConfiguration(value);
        pushStep(steps, 'selectConfiguration', true, String(value));
    } else if (device.configuration) {
        pushStep(steps, 'selectConfiguration', true, `already ${device.configuration.configurationValue}`);
    }
    if (!device.configuration) {
        pushStep(steps, 'selectConfiguration', false, 'none');
        throw new WebUsbPrintError('no-configuration', 'Failed to select a USB configuration on the device.');
    }
}

function isAlreadyClaimedError(err: unknown): boolean {
    const name = errorNameOf(err);
    const msg = errorMessageOf(err);
    return name === 'InvalidStateError' || /already claimed|already opened/i.test(msg);
}

async function prepareHeldDevice(
    device: UsbHardwareDevice,
    steps: UsbAttemptStep[],
    tries = openRetryTries(),
    authorizedCount: number | null = null,
): Promise<HeldUsbSession> {
    await openUsbDevice(device, steps, tries, authorizedCount);
    held = { device, target: findBulkOutEndpoint(device), claimed: false };
    notifyUsbSession();

    await ensureConfiguration(device, steps);
    const target = findBulkOutEndpoint(device);
    if (!target) {
        pushStep(steps, 'findBulkOut', false);
        throw new WebUsbPrintError('no-endpoint', 'No bulk output endpoint found on this device.');
    }
    pushStep(steps, 'findBulkOut', true, `iface ${target.interfaceNumber} ep ${target.endpointNumber}`);

    try {
        await device.claimInterface(target.interfaceNumber);
        pushStep(steps, 'claimInterface', true, String(target.interfaceNumber));
        held = { device, target, claimed: true };
    } catch (err) {
        if (isAlreadyClaimedError(err)) {
            pushStep(steps, 'claimInterface', true, 'already claimed');
            held = { device, target, claimed: true };
        } else {
            pushStep(steps, 'claimInterface', false, errorMessageOf(err));
            throw wrapWebUsbError(err);
        }
    }
    notifyUsbSession();
    pushStep(steps, 'hold', true, 'keeping USB open so ChromeOS cannot reclaim the printer');
    return held;
}

async function tryOpenCandidates(
    candidates: UsbHardwareDevice[],
    steps: UsbAttemptStep[],
    tries: number,
    authorizedCount: number,
    detailSuffix = '',
): Promise<UsbHardwareDevice | undefined> {
    let lastErr: unknown;
    for (const candidate of candidates) {
        const id = `${toUsbHexId(candidate.vendorId)}:${toUsbHexId(candidate.productId)}`;
        pushStep(steps, 'authorized', true, detailSuffix ? `${id}${detailSuffix}` : id);
        try {
            await prepareHeldDevice(candidate, steps, tries, authorizedCount);
            return candidate;
        } catch (err) {
            lastErr = err;
            pushStep(steps, 'authorizedOpen', false, errorMessageOf(err));
        }
    }
    if (lastErr) throw lastErr;
    return undefined;
}

async function acquireDevice(steps: UsbAttemptStep[], prompt: boolean): Promise<UsbHardwareDevice> {
    if (heldIsUsable()) {
        const summary = summarizeUsbDevice(held!.device);
        pushStep(steps, 'reuseHeld', true, `${summary.vendorIdHex}:${summary.productIdHex}`);
        return held!.device;
    }

    const usb = usbBus();
    if (!usb) {
        throw new WebUsbPrintError('unsupported', 'WebUSB is not supported in this browser.');
    }

    const tries = openRetryTries();
    const authorized = await usb.getDevices();
    pushStep(
        steps,
        'getDevices',
        authorized.length > 0,
        authorized.length === 0
            ? 'empty — picker needed; ChromeOS may still own class-7 with no saved printer'
            : `${authorized.length} authorized`,
    );

    const preferred = selectPreferredUsbDevice(authorized);
    const candidates = preferred
        ? [preferred, ...authorized.filter((d) => d !== preferred)]
        : authorized;

    let lastErr: unknown;
    try {
        const opened = await tryOpenCandidates(candidates, steps, tries, authorized.length);
        if (opened) return opened;
    } catch (err) {
        lastErr = err;
    }

    if (!prompt) {
        throw wrapWebUsbError(
            lastErr ?? new WebUsbPrintError('access-denied', USB_ACCESS_DENIED_HELP, 'no authorized USB device could be opened'),
        );
    }

    if (candidates.length > 0 && lastErr && isUsbAccessDenied(lastErr)) {
        throw wrapWebUsbError(lastErr);
    }

    const device = await requestUsbDevice();
    const summary = summarizeUsbDevice(device);
    pushStep(steps, 'requestDevice', true, `${summary.vendorIdHex}:${summary.productIdHex}`);
    try {
        await prepareHeldDevice(device, steps, tries, authorized.length);
        return device;
    } catch (err) {
        lastErr = err;
        const again = await usb.getDevices();
        const rest = again.filter((d) => d !== device);
        try {
            const opened = await tryOpenCandidates(rest, steps, tries, again.length, ' after picker');
            if (opened) return opened;
        } catch (inner) {
            lastErr = inner;
        }
        throw wrapWebUsbError(lastErr);
    }
}

async function grabDevice(device: UsbHardwareDevice, reason: string, tries = connectRetryTries()): Promise<void> {
    const attempt: UsbAttemptLog = {
        at: new Date().toISOString(),
        kind: 'probe',
        steps: [],
        device: summarizeUsbDevice(device),
    };
    pushStep(attempt.steps, 'grab', true, reason);
    try {
        if (heldIsUsable() && sameUsbDevice(held!.device, device)) {
            pushStep(attempt.steps, 'reuseHeld', true);
            recordUsbAttempt(attempt);
            return;
        }
        await prepareHeldDevice(device, attempt.steps, tries, 1);
        attempt.device = summarizeUsbDevice(device);
    } catch (err) {
        const wrapped = wrapWebUsbError(err);
        attempt.errorKind = wrapped.kind;
        attempt.error = wrapped.rawMessage || wrapped.message;
    }
    recordUsbAttempt(attempt);
}

function onUsbConnect(event: UsbConnectionEventLike): Promise<void> | void {
    if (event?.device) return grabDevice(event.device, 'connect', connectRetryTries());
}

function onUsbDisconnect(event: UsbConnectionEventLike): void {
    if (event?.device) clearHeld(event.device);
}

function onVisibilityChange(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') void startUsbHolder();
}

function ensureUsbListeners(): void {
    const usb = usbBus();
    if (usb) {
        if (!holderStarted) {
            holderStarted = true;
            notifyUsbSession();
        }
        if (!usbListenersAttached) {
            usbListenersAttached = true;
            usb.addEventListener?.('connect', onUsbConnect);
            usb.addEventListener?.('disconnect', onUsbDisconnect);
        }
    }
    if (typeof document !== 'undefined' && !visibilityListenerAttached) {
        visibilityListenerAttached = true;
        document.addEventListener('visibilitychange', onVisibilityChange);
    }
}

export async function startUsbHolder(): Promise<void> {
    ensureUsbListeners();
    const usb = usbBus();
    if (!usb) return;
    if (heldIsUsable()) return;

    const devices = await usb.getDevices();
    const preferred = selectPreferredUsbDevice(devices);
    const ordered = preferred ? [preferred, ...devices.filter((d) => d !== preferred)] : devices;
    for (const device of ordered) {
        await grabDevice(device, 'startup', connectRetryTries());
        if (heldIsUsable()) return;
    }
}

export async function releaseUsbSession(): Promise<void> {
    if (!held) return;
    const session = held;
    try {
        if (session.claimed && session.target) {
            await session.device.releaseInterface(session.target.interfaceNumber);
        }
    } catch {
        /* ignore */
    }
    try {
        if (session.device.opened) await session.device.close();
    } catch {
        /* ignore */
    }
    held = null;
    notifyUsbSession();
}

export async function printBrfWebUSB(data: Uint8Array): Promise<void> {
    const attempt: UsbAttemptLog = {
        at: new Date().toISOString(),
        kind: 'print',
        steps: [],
        device: null,
    };

    if (!usbBus()) {
        const err = new WebUsbPrintError('unsupported', 'WebUSB is not supported in this browser.');
        attempt.errorKind = err.kind;
        attempt.error = err.message;
        recordUsbAttempt(attempt);
        throw err;
    }

    let thrown: WebUsbPrintError | undefined;
    try {
        ensureUsbListeners();
        const device = await acquireDevice(attempt.steps, true);
        const session = heldIsUsable() && held ? held : await prepareHeldDevice(device, attempt.steps);
        attempt.device = summarizeUsbDevice(session.device);
        if (!session.target) {
            throw new WebUsbPrintError('no-endpoint', 'No bulk output endpoint found on this device.');
        }
        const result = await session.device.transferOut(session.target.endpointNumber, data);
        if (result.status !== 'ok') {
            pushStep(attempt.steps, 'transferOut', false, result.status);
            throw new WebUsbPrintError('transfer-failed', `USB transfer failed with status: ${result.status}`);
        }
        pushStep(attempt.steps, 'transferOut', true, `${data.byteLength} bytes`);
    } catch (err) {
        thrown = wrapWebUsbError(err);
        attempt.errorKind = thrown.kind;
        attempt.error = thrown.rawMessage || thrown.message;
        if (!attempt.device && held) attempt.device = summarizeUsbDevice(held.device);
    }
    recordUsbAttempt(attempt);
    if (thrown) throw thrown;
}

export async function listAuthorizedUsbDevices(): Promise<UsbDeviceSummary[]> {
    const usb = usbBus();
    if (!usb) {
        throw new WebUsbPrintError('unsupported', 'WebUSB is not supported in this browser.');
    }
    const devices = await usb.getDevices();
    return devices.map(summarizeUsbDevice);
}

export async function requestUsbDeviceForDebug(): Promise<UsbDeviceSummary> {
    const attempt: UsbAttemptLog = {
        at: new Date().toISOString(),
        kind: 'request',
        steps: [],
        device: null,
    };
    try {
        await startUsbHolder();
        const device = await requestUsbDevice();
        const summary = summarizeUsbDevice(device);
        attempt.device = summary;
        pushStep(attempt.steps, 'requestDevice', true, `${summary.vendorIdHex}:${summary.productIdHex}`);
        await prepareHeldDevice(device, attempt.steps);
        attempt.device = summarizeUsbDevice(device);
        recordUsbAttempt(attempt);
        return summarizeUsbDevice(device);
    } catch (err) {
        const wrapped = wrapWebUsbError(err);
        attempt.errorKind = wrapped.kind;
        attempt.error = wrapped.rawMessage || wrapped.message;
        if (!attempt.steps.some((s) => !s.ok)) {
            pushStep(attempt.steps, 'requestDevice', false, attempt.error);
        }
        recordUsbAttempt(attempt);
        throw wrapped;
    }
}

export async function probeUsbDevice(): Promise<UsbAttemptLog> {
    const attempt: UsbAttemptLog = {
        at: new Date().toISOString(),
        kind: 'probe',
        steps: [],
        device: null,
    };

    try {
        await startUsbHolder();
        const device = await acquireDevice(attempt.steps, true);
        if (!heldIsUsable()) await prepareHeldDevice(device, attempt.steps);
        attempt.device = summarizeUsbDevice(device);
        if (held?.target) {
            pushStep(
                attempt.steps,
                'held',
                true,
                `iface ${held.target.interfaceNumber} ep ${held.target.endpointNumber}`,
            );
        }
    } catch (err) {
        const wrapped = wrapWebUsbError(err);
        attempt.errorKind = wrapped.kind;
        attempt.error = wrapped.rawMessage || wrapped.message;
        if (!attempt.steps.some((s) => !s.ok)) {
            pushStep(attempt.steps, 'probe', false, attempt.error);
        }
        if (!attempt.device && held) attempt.device = summarizeUsbDevice(held.device);
    }
    recordUsbAttempt(attempt);
    return attempt;
}

export async function forgetAuthorizedUsbDevices(): Promise<number> {
    const usb = usbBus();
    if (!usb) {
        throw new WebUsbPrintError('unsupported', 'WebUSB is not supported in this browser.');
    }
    await releaseUsbSession();
    const devices = await usb.getDevices();
    let forgotten = 0;
    for (const device of devices) {
        if (typeof device.forget === 'function') {
            await device.forget();
            forgotten += 1;
        }
    }
    recordUsbAttempt({
        at: new Date().toISOString(),
        kind: 'list',
        steps: [{ name: 'forget', ok: true, detail: `${forgotten} device(s) — ChromeOS may now reclaim the printer` }],
        device: null,
    });
    return forgotten;
}
