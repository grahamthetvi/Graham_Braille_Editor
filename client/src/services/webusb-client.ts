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

export interface UsbHardwareBus {
    requestDevice(options: { filters: unknown[] }): Promise<UsbHardwareDevice>;
    getDevices(): Promise<UsbHardwareDevice[]>;
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

export const USB_ACCESS_DENIED_HELP =
    'USB Access Denied: ChromeOS is holding this embosser. Remove it under Settings → Print → Printers, unplug and replug USB, dismiss any printer setup prompt, then try again. Open USB Debug for a device probe.';

export const USB_ATTEMPT_EVENT = 'graham-usb-attempt';

let lastAttempt: UsbAttemptLog | null = null;

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

function pushStep(steps: UsbAttemptStep[], name: string, ok: boolean, detail?: string): void {
    steps.push(detail ? { name, ok, detail } : { name, ok });
}

function usbBus(): UsbHardwareBus | null {
    if (typeof navigator === 'undefined') return null;
    const usb = (navigator as Navigator & { usb?: UsbHardwareBus }).usb;
    return usb ?? null;
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

async function openUsbDevice(device: UsbHardwareDevice, steps: UsbAttemptStep[]): Promise<void> {
    if (device.opened) {
        pushStep(steps, 'open', true, 'already open');
        return;
    }
    try {
        await device.open();
        pushStep(steps, 'open', true);
    } catch (err) {
        pushStep(steps, 'open', false, errorMessageOf(err));
        throw wrapWebUsbError(err);
    }
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

async function closeQuietly(device: UsbHardwareDevice | undefined, steps: UsbAttemptStep[]): Promise<void> {
    if (!device) return;
    try {
        await device.close();
        pushStep(steps, 'close', true);
    } catch (err) {
        pushStep(steps, 'close', false, errorMessageOf(err));
    }
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

    let device: UsbHardwareDevice | undefined;
    let thrown: WebUsbPrintError | undefined;
    try {
        device = await requestUsbDevice();
        attempt.device = summarizeUsbDevice(device);
        pushStep(attempt.steps, 'requestDevice', true, `${attempt.device.vendorIdHex}:${attempt.device.productIdHex}`);

        await openUsbDevice(device, attempt.steps);
        attempt.device = summarizeUsbDevice(device);
        await ensureConfiguration(device, attempt.steps);
        attempt.device = summarizeUsbDevice(device);

        const target = findBulkOutEndpoint(device);
        if (!target) {
            pushStep(attempt.steps, 'findBulkOut', false);
            throw new WebUsbPrintError('no-endpoint', 'No bulk output endpoint found on this device.');
        }
        pushStep(
            attempt.steps,
            'findBulkOut',
            true,
            `iface ${target.interfaceNumber} ep ${target.endpointNumber}`,
        );

        try {
            await device.claimInterface(target.interfaceNumber);
            pushStep(attempt.steps, 'claimInterface', true, String(target.interfaceNumber));
        } catch (err) {
            pushStep(attempt.steps, 'claimInterface', false, errorMessageOf(err));
            throw wrapWebUsbError(err);
        }

        try {
            const result = await device.transferOut(target.endpointNumber, data);
            if (result.status !== 'ok') {
                pushStep(attempt.steps, 'transferOut', false, result.status);
                throw new WebUsbPrintError('transfer-failed', `USB transfer failed with status: ${result.status}`);
            }
            pushStep(attempt.steps, 'transferOut', true, `${data.byteLength} bytes`);
        } finally {
            try {
                await device.releaseInterface(target.interfaceNumber);
                pushStep(attempt.steps, 'releaseInterface', true);
            } catch (err) {
                pushStep(attempt.steps, 'releaseInterface', false, errorMessageOf(err));
            }
        }
    } catch (err) {
        thrown = wrapWebUsbError(err);
        attempt.errorKind = thrown.kind;
        attempt.error = thrown.rawMessage || thrown.message;
    } finally {
        await closeQuietly(device, attempt.steps);
        recordUsbAttempt(attempt);
    }

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
        const device = await requestUsbDevice();
        const summary = summarizeUsbDevice(device);
        attempt.device = summary;
        pushStep(attempt.steps, 'requestDevice', true, `${summary.vendorIdHex}:${summary.productIdHex}`);
        recordUsbAttempt(attempt);
        return summary;
    } catch (err) {
        const wrapped = wrapWebUsbError(err);
        attempt.errorKind = wrapped.kind;
        attempt.error = wrapped.rawMessage || wrapped.message;
        pushStep(attempt.steps, 'requestDevice', false, attempt.error);
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

    let device: UsbHardwareDevice | undefined;
    try {
        device = await requestUsbDevice();
        attempt.device = summarizeUsbDevice(device);
        pushStep(attempt.steps, 'requestDevice', true, `${attempt.device.vendorIdHex}:${attempt.device.productIdHex}`);

        await openUsbDevice(device, attempt.steps);
        attempt.device = summarizeUsbDevice(device);
        await ensureConfiguration(device, attempt.steps);
        attempt.device = summarizeUsbDevice(device);

        const target = findBulkOutEndpoint(device);
        if (!target) {
            pushStep(attempt.steps, 'findBulkOut', false, 'none');
        } else {
            pushStep(
                attempt.steps,
                'findBulkOut',
                true,
                `iface ${target.interfaceNumber} ep ${target.endpointNumber}`,
            );
            try {
                await device.claimInterface(target.interfaceNumber);
                pushStep(attempt.steps, 'claimInterface', true, String(target.interfaceNumber));
                try {
                    await device.releaseInterface(target.interfaceNumber);
                    pushStep(attempt.steps, 'releaseInterface', true);
                } catch (err) {
                    pushStep(attempt.steps, 'releaseInterface', false, errorMessageOf(err));
                }
            } catch (err) {
                pushStep(attempt.steps, 'claimInterface', false, errorMessageOf(err));
                attempt.errorKind = classifyWebUsbError(err);
                attempt.error = errorMessageOf(err);
            }
        }
    } catch (err) {
        const wrapped = wrapWebUsbError(err);
        attempt.errorKind = wrapped.kind;
        attempt.error = wrapped.rawMessage || wrapped.message;
        if (!attempt.steps.some((s) => !s.ok)) {
            pushStep(attempt.steps, 'probe', false, attempt.error);
        }
    } finally {
        await closeQuietly(device, attempt.steps);
        recordUsbAttempt(attempt);
    }

    return attempt;
}

export async function forgetAuthorizedUsbDevices(): Promise<number> {
    const usb = usbBus();
    if (!usb) {
        throw new WebUsbPrintError('unsupported', 'WebUSB is not supported in this browser.');
    }
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
        steps: [{ name: 'forget', ok: true, detail: `${forgotten} device(s)` }],
        device: null,
    });
    return forgotten;
}
