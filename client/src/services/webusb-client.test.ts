import { describe, expect, it } from 'vitest';
import {
  classifyWebUsbError,
  findBulkOutEndpoint,
  isUsbAccessDenied,
  summarizeUsbDevice,
  toUsbHexId,
  usbClassLabel,
  wrapWebUsbError,
  type UsbDeviceLike,
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
    expect(wrapped.message).toMatch(/ChromeOS is holding this embosser/);
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
  });
});
