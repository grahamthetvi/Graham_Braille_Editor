import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  USB_ACCESS_DENIED_HELP,
  USB_OPEN_RETRY_TRIES,
  classifyWebUsbError,
  findBulkOutEndpoint,
  getLastUsbAttempt,
  isUsbAccessDenied,
  printBrfWebUSB,
  resetUsbClientForTests,
  selectPreferredUsbDevice,
  setUsbHardwareBusForTests,
  setUsbOpenRetryForTests,
  startUsbHolder,
  summarizeUsbDevice,
  toUsbHexId,
  usbClassLabel,
  wrapWebUsbError,
  VIEWPLUS_VENDOR_ID,
  type UsbConnectionEventLike,
  type UsbDeviceLike,
  type UsbHardwareBus,
  type UsbHardwareDevice,
} from './webusb-client';
import { buildUsbDebugExport, USB_DEBUG_STORAGE_KEY } from './webusb-debug';

function printerLikeDevice(): UsbDeviceLike {
  return {
    opened: false,
    vendorId: 0x0461,
    productId: 0x4d64,
    productName: 'Embosser',
    manufacturerName: 'ViewPlus',
    deviceClass: 0,
    deviceSubclass: 0,
    deviceProtocol: 0,
    configuration: { configurationValue: 1 },
    configurations: [
      {
        configurationValue: 1,
        interfaces: [
          {
            interfaceNumber: 0,
            claimed: false,
            alternates: [
              {
                alternateSetting: 0,
                interfaceClass: 7,
                interfaceSubclass: 1,
                interfaceProtocol: 2,
                endpoints: [
                  { endpointNumber: 1, direction: 'in', type: 'bulk', packetSize: 64 },
                  { endpointNumber: 2, direction: 'out', type: 'bulk', packetSize: 64 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('WebUSB helpers', () => {
  it('formats USB ids and class labels', () => {
    expect(toUsbHexId(0x0461)).toBe('0x0461');
    expect(toUsbHexId(7)).toBe('0x0007');
    expect(usbClassLabel(7)).toBe('Printer');
    expect(usbClassLabel(255)).toBe('Vendor-specific');
    expect(usbClassLabel(42)).toBe('Class 42');
  });

  it('detects Access Denied from Chrome USBDevice.open', () => {
    const err = new DOMException(
      "Failed to execute 'open' on 'USBDevice': Access Denied",
      'SecurityError',
    );
    expect(isUsbAccessDenied(err)).toBe(true);
    expect(classifyWebUsbError(err)).toBe('access-denied');
    const wrapped = wrapWebUsbError(err);
    expect(wrapped.kind).toBe('access-denied');
    expect(wrapped.message).toMatch(/ChromeOS claimed this USB printer/);
    expect(wrapped.rawMessage).toMatch(/Access Denied/);
  });

  it('does not treat a cancelled picker as access denied', () => {
    const err = new DOMException('No device selected.', 'NotFoundError');
    expect(isUsbAccessDenied(err)).toBe(false);
    expect(classifyWebUsbError(err)).toBe('not-selected');
  });

  it('summarizes a printer-class embosser and finds bulk OUT', () => {
    const device = printerLikeDevice();
    const summary = summarizeUsbDevice(device);
    expect(summary.vendorIdHex).toBe('0x0461');
    expect(summary.productIdHex).toBe('0x4D64');
    expect(summary.printerClass).toBe(true);
    expect(summary.configurations[0].interfaces[0].alternates[0].interfaceClassLabel).toBe('Printer');
    expect(findBulkOutEndpoint(device)).toEqual({
      configurationValue: 1,
      interfaceNumber: 0,
      endpointNumber: 2,
    });
    expect(findBulkOutEndpoint({ vendorId: 1, productId: 2, configurations: [] })).toBeNull();
  });

  it('builds a compact USB debug export', () => {
    const json = buildUsbDebugExport([]);
    expect(json.v).toBe(1);
    expect(json.authorized).toEqual([]);
    expect(json.env).toEqual(
      expect.objectContaining({
        chromeOS: expect.any(Boolean),
        webUsb: expect.any(Boolean),
      }),
    );
    expect(USB_DEBUG_STORAGE_KEY).toBe('graham.usbDebug');
    expect(json.session).toEqual(
      expect.objectContaining({
        held: false,
        opened: false,
        grabOnConnect: false,
      }),
    );
  });

  it('prefers a ViewPlus Max and finds bulk OUT on endpoint 1', () => {
    const other: UsbDeviceLike = { vendorId: 0x1234, productId: 1, productName: 'Hub' };
    const max: UsbDeviceLike = {
      opened: false,
      vendorId: VIEWPLUS_VENDOR_ID,
      productId: 0x0008,
      productName: 'Max',
      manufacturerName: 'ViewPlus',
      deviceClass: 0,
      configurations: [
        {
          configurationValue: 1,
          interfaces: [
            {
              interfaceNumber: 0,
              claimed: false,
              alternates: [
                {
                  alternateSetting: 0,
                  interfaceClass: 7,
                  interfaceSubclass: 1,
                  interfaceProtocol: 2,
                  endpoints: [
                    { endpointNumber: 1, direction: 'in', type: 'bulk', packetSize: 16 },
                    { endpointNumber: 1, direction: 'out', type: 'bulk', packetSize: 16 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(selectPreferredUsbDevice([other, max])).toBe(max);
    expect(findBulkOutEndpoint(max)).toEqual({
      configurationValue: 1,
      interfaceNumber: 0,
      endpointNumber: 1,
    });
    expect(summarizeUsbDevice(max).printerClass).toBe(true);
  });

  it('explains Access Denied even when no CUPS printer is saved', () => {
    expect(USB_ACCESS_DENIED_HELP).toMatch(/no saved printer|nothing saved/i);
    expect(USB_ACCESS_DENIED_HELP).toMatch(/class 7/i);
    const wrapped = wrapWebUsbError(
      new DOMException("Failed to execute 'open' on 'USBDevice': Access Denied", 'SecurityError'),
    );
    expect(wrapped.message).toMatch(/cupsPrinters|no saved printer|nothing saved/i);
  });
});

function accessDenied(): DOMException {
  return new DOMException("Failed to execute 'open' on 'USBDevice': Access Denied", 'SecurityError');
}

function printerConfigurations(): NonNullable<UsbDeviceLike['configurations']> {
  return [
    {
      configurationValue: 1,
      interfaces: [
        {
          interfaceNumber: 0,
          claimed: false,
          alternates: [
            {
              alternateSetting: 0,
              interfaceClass: 7,
              interfaceSubclass: 1,
              interfaceProtocol: 2,
              endpoints: [
                { endpointNumber: 1, direction: 'in', type: 'bulk', packetSize: 16 },
                { endpointNumber: 1, direction: 'out', type: 'bulk', packetSize: 16 },
              ],
            },
          ],
        },
      ],
    },
  ];
}

class FakeUsbDevice implements UsbHardwareDevice {
  opened = false;
  vendorId = VIEWPLUS_VENDOR_ID;
  productId = 0x0008;
  productName = 'Max';
  manufacturerName = 'ViewPlus';
  deviceClass = 0;
  deviceSubclass = 0;
  deviceProtocol = 0;
  configuration: { configurationValue: number } | null = { configurationValue: 1 };
  configurations = printerConfigurations();
  openCalls = 0;
  closeCalls = 0;
  failOpens = 0;
  transferCalls = 0;

  async open(): Promise<void> {
    this.openCalls += 1;
    if (this.openCalls <= this.failOpens) throw accessDenied();
    this.opened = true;
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.opened = false;
  }

  async selectConfiguration(): Promise<void> {}
  async claimInterface(): Promise<void> {}
  async releaseInterface(): Promise<void> {}
  async transferOut(): Promise<{ status: string }> {
    this.transferCalls += 1;
    return { status: 'ok' };
  }
}

class FakeUsbBus implements UsbHardwareBus {
  devices: FakeUsbDevice[] = [];
  picker: FakeUsbDevice | null = null;
  requestCalls = 0;
  connectListeners: Array<(event: UsbConnectionEventLike) => void | Promise<void>> = [];

  async requestDevice(): Promise<UsbHardwareDevice> {
    this.requestCalls += 1;
    if (!this.picker) {
      throw new DOMException('No device selected.', 'NotFoundError');
    }
    if (!this.devices.includes(this.picker)) this.devices.push(this.picker);
    return this.picker;
  }

  async getDevices(): Promise<UsbHardwareDevice[]> {
    return this.devices;
  }

  addEventListener(type: 'connect' | 'disconnect', listener: (event: UsbConnectionEventLike) => void | Promise<void>): void {
    if (type === 'connect') this.connectListeners.push(listener);
  }
}

describe('WebUSB print / grab retries', () => {
  beforeEach(() => {
    resetUsbClientForTests();
    setUsbOpenRetryForTests({ delayMs: 0 });
  });

  afterEach(() => {
    resetUsbClientForTests();
    vi.unstubAllGlobals();
  });

  it('prints with getDevices()+open and skips the picker when the Max is already authorized', async () => {
    const max = new FakeUsbDevice();
    const bus = new FakeUsbBus();
    bus.devices = [max];
    bus.picker = max;
    setUsbHardwareBusForTests(bus);

    await printBrfWebUSB(new Uint8Array([1, 2, 3]));

    expect(bus.requestCalls).toBe(0);
    expect(max.openCalls).toBe(1);
    expect(max.closeCalls).toBe(0);
    expect(max.transferCalls).toBe(1);
    const steps = getLastUsbAttempt()?.steps.map((s) => s.name) ?? [];
    expect(steps).toContain('getDevices');
    expect(steps).toContain('authorized');
    expect(steps).not.toContain('requestDevice');
  });

  it('retries authorized open with the full print budget, not a weaker 8-try budget', async () => {
    const max = new FakeUsbDevice();
    max.failOpens = 10;
    const bus = new FakeUsbBus();
    bus.devices = [max];
    bus.picker = max;
    setUsbHardwareBusForTests(bus);

    await printBrfWebUSB(new Uint8Array([9]));

    expect(max.openCalls).toBe(11);
    expect(bus.requestCalls).toBe(0);
    expect(max.closeCalls).toBe(0);
    expect(getLastUsbAttempt()?.steps.some((s) => s.name === 'open' && s.ok && s.detail?.includes('retry 11'))).toBe(
      true,
    );
  });

  it('does not open the picker after authorized Access Denied, and does not close()', async () => {
    const max = new FakeUsbDevice();
    max.failOpens = USB_OPEN_RETRY_TRIES;
    const bus = new FakeUsbBus();
    bus.devices = [max];
    bus.picker = max;
    setUsbHardwareBusForTests(bus);

    await expect(printBrfWebUSB(new Uint8Array([1]))).rejects.toMatchObject({ kind: 'access-denied' });

    expect(bus.requestCalls).toBe(0);
    expect(max.openCalls).toBe(USB_OPEN_RETRY_TRIES);
    expect(max.closeCalls).toBe(0);
    const attempt = getLastUsbAttempt();
    expect(attempt?.steps.find((s) => s.name === 'getDevices')?.ok).toBe(true);
    const openStep = attempt?.steps.find((s) => s.name === 'open' && !s.ok);
    expect(openStep?.detail).toMatch(/after 25 open tries/i);
    expect(openStep?.detail).toMatch(/getDevices\(\) had 1 authorized/);
    expect(openStep?.detail).toMatch(/no saved printer/i);
  });

  it('logs empty getDevices then uses the picker, still retrying open hard', async () => {
    const max = new FakeUsbDevice();
    max.failOpens = 4;
    const bus = new FakeUsbBus();
    bus.picker = max;
    setUsbHardwareBusForTests(bus);

    await printBrfWebUSB(new Uint8Array([7]));

    expect(bus.requestCalls).toBe(1);
    expect(max.openCalls).toBe(5);
    expect(max.closeCalls).toBe(0);
    const attempt = getLastUsbAttempt();
    expect(attempt?.steps.find((s) => s.name === 'getDevices')?.ok).toBe(false);
    expect(attempt?.steps.find((s) => s.name === 'getDevices')?.detail).toMatch(/empty/);
    expect(attempt?.steps.some((s) => s.name === 'requestDevice' && s.ok)).toBe(true);
    expect(attempt?.steps.some((s) => s.name === 'authorized')).toBe(false);
  });

  it('re-grabs on a later startUsbHolder even if the first call found nothing', async () => {
    const max = new FakeUsbDevice();
    const bus = new FakeUsbBus();
    setUsbHardwareBusForTests(bus);

    await startUsbHolder();
    expect(max.openCalls).toBe(0);

    bus.devices = [max];
    await startUsbHolder();
    expect(max.openCalls).toBe(1);
    expect(max.opened).toBe(true);
  });

  it('retries open on usb connect with the connect budget', async () => {
    const max = new FakeUsbDevice();
    max.failOpens = 12;
    const bus = new FakeUsbBus();
    setUsbHardwareBusForTests(bus);

    await startUsbHolder();
    expect(bus.connectListeners.length).toBe(1);

    await bus.connectListeners[0]({ device: max });
    expect(max.openCalls).toBe(13);
    expect(max.opened).toBe(true);
    expect(max.closeCalls).toBe(0);
    expect(getLastUsbAttempt()?.steps.some((s) => s.name === 'grab' && s.detail === 'connect')).toBe(true);
  });

  it('startup grab keeps retrying past the print budget to beat ChromeOS claiming class-7', async () => {
    const max = new FakeUsbDevice();
    max.failOpens = 30;
    const bus = new FakeUsbBus();
    bus.devices = [max];
    setUsbHardwareBusForTests(bus);

    await startUsbHolder();

    expect(max.openCalls).toBe(31);
    expect(max.opened).toBe(true);
    expect(max.closeCalls).toBe(0);
  });

  it('re-grabs authorized devices when the tab becomes visible', async () => {
    const max = new FakeUsbDevice();
    const bus = new FakeUsbBus();
    const listeners: Record<string, () => void | Promise<void>> = {};
    vi.stubGlobal('document', {
      visibilityState: 'hidden',
      addEventListener: (type: string, fn: () => void | Promise<void>) => {
        listeners[type] = fn;
      },
    });
    setUsbHardwareBusForTests(bus);

    await startUsbHolder();
    expect(max.openCalls).toBe(0);

    bus.devices = [max];
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (type: string, fn: () => void | Promise<void>) => {
        listeners[type] = fn;
      },
    });
    await listeners.visibilitychange?.();

    expect(max.openCalls).toBe(1);
    expect(max.opened).toBe(true);
    vi.unstubAllGlobals();
  });
});
