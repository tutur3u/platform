import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readSquareDevicePreference,
  resolveSquareDevicePreference,
  squareDevicePreferenceKey,
  writeSquareDevicePreference,
} from './square-device-preference';

const devices = [
  {
    code: null,
    id: 'front',
    locationId: 'location-a',
    name: 'Front counter',
    pairedAt: null,
    productType: 'TERMINAL_API',
    status: 'PAIRED',
    updatedAt: null,
  },
  {
    code: null,
    id: 'popup',
    locationId: 'location-a',
    name: 'Popup counter',
    pairedAt: null,
    productType: 'TERMINAL_API',
    status: 'PAIRED',
    updatedAt: null,
  },
];

describe('Square storefront device preference', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });

  it('scopes the remembered device to one storefront', () => {
    writeSquareDevicePreference('veizo', 'front');

    expect(readSquareDevicePreference('veizo')).toBe('front');
    expect(readSquareDevicePreference('another-store')).toBe('');
    expect(squareDevicePreferenceKey('veizo')).toBe(
      'storefront-pos-device:veizo'
    );
  });

  it('prefers a valid browser choice over the workspace default', () => {
    expect(
      resolveSquareDevicePreference({
        defaultDeviceId: 'front',
        devices,
        preferredDeviceId: 'popup',
      })
    ).toBe('popup');
  });

  it('falls back safely when the remembered device is no longer available', () => {
    expect(
      resolveSquareDevicePreference({
        defaultDeviceId: 'front',
        devices,
        preferredDeviceId: 'retired-device',
      })
    ).toBe('front');
  });
});
