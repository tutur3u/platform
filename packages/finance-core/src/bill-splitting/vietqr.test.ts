import { expect, it } from 'vitest';
import { createVietQr, vietQrChecksum } from './vietqr';

it('encodes a synthetic account locally using NAPAS account-transfer fields', () => {
  const code = createVietQr('970499', '0001234567');
  expect(code).toMatch(
    /^00020101021138540010A00000072701240006970499011000012345670208QRIBFTTA53037045802VN6304[0-9A-F]{4}$/
  );
  expect(code.slice(-4)).toBe(vietQrChecksum(code.slice(0, -4)));
});

it('implements the CRC check value and rejects incompatible field characters', () => {
  expect(vietQrChecksum('123456789')).toBe('29B1');
  expect(() => createVietQr('970499', '1234<test>')).toThrow();
  expect(() => createVietQr('123', '1234')).toThrow();
});
