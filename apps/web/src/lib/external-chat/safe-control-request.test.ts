import { describe, expect, it } from 'vitest';
import {
  assertSafeExternalChatUrl,
  isBlockedExternalChatAddress,
} from './safe-control-request';

describe('external chat control destination policy', () => {
  it.each([
    'http://bridge.example.com',
    'https://user:password@bridge.example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
  ])('rejects unsafe URL %s', async (url) => {
    await expect(assertSafeExternalChatUrl(url)).rejects.toThrow();
  });

  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
    'ff02::1',
  ])('blocks non-public address %s', (address) => {
    expect(isBlockedExternalChatAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows globally routable address %s',
    (address) => {
      expect(isBlockedExternalChatAddress(address)).toBe(false);
    }
  );
});
