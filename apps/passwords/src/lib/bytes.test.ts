import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  downloadName,
} from './bytes';

describe('bytes', () => {
  it('round-trips binary content larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('decodes UTF-8 and refuses binary', () => {
    expect(decodeUtf8(new TextEncoder().encode('mật khẩu'))).toBe('mật khẩu');
    expect(decodeUtf8(Uint8Array.of(0xff, 0xfe, 0x00))).toBeNull();
  });

  it('sanitizes download names', () => {
    expect(downloadName('../prod: key?.pem')).toBe('.._prod_ key_.pem');
    expect(downloadName('   ')).toBe('secret');
  });
});
