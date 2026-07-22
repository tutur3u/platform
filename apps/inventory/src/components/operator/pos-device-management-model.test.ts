import { describe, expect, it } from 'vitest';
import {
  getPosDeviceSummary,
  isSquareDeviceReady,
} from './pos-device-management-model';

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
    status: 'OFFLINE',
    updatedAt: null,
  },
];

describe('POS device management model', () => {
  it('recognizes safe ready states without treating offline devices as ready', () => {
    expect(isSquareDeviceReady('ONLINE')).toBe(true);
    expect(isSquareDeviceReady('paired')).toBe(true);
    expect(isSquareDeviceReady('OFFLINE')).toBe(false);
    expect(isSquareDeviceReady(null)).toBe(false);
  });

  it('summarizes paired devices and resolves the saved default', () => {
    expect(getPosDeviceSummary(devices, 'front')).toEqual({
      defaultDevice: devices[0],
      ready: 1,
      total: 2,
    });
  });
});
