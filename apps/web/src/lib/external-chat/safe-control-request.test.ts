import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeExternalChatUrl,
  closeExternalChatDispatcher,
  ExternalChatUrlPolicyError,
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
    await expect(assertSafeExternalChatUrl(url)).rejects.toBeInstanceOf(
      ExternalChatUrlPolicyError
    );
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
    '::7f00:1',
    '64:ff9b::a00:1',
    '64:ff9b::',
    '64:ff9b:1::808:808',
    'fec0::1',
    'ff02::1',
  ])('blocks non-public address %s', (address) => {
    expect(isBlockedExternalChatAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '192.0.0.9',
    '192.0.0.10',
    '2606:4700:4700::1111',
    '64:ff9b::808:808',
  ])('allows globally routable address %s', (address) => {
    expect(isBlockedExternalChatAddress(address)).toBe(false);
  });

  it('closes dispatchers gracefully when supported', async () => {
    const close = vi.fn();
    const destroy = vi.fn();

    await closeExternalChatDispatcher({ close, destroy });

    expect(close).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('falls back to destroying dispatchers without graceful close', async () => {
    const destroy = vi.fn();

    await closeExternalChatDispatcher({ destroy });

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('supports runtimes without dispatcher lifecycle methods', async () => {
    await expect(closeExternalChatDispatcher({})).resolves.toBeUndefined();
  });

  it.each(['close', 'destroy'] as const)(
    'does not let a rejected %s mask the request result',
    async (method) => {
      await expect(
        closeExternalChatDispatcher({
          [method]: vi.fn().mockRejectedValue(new Error('cleanup failed')),
        })
      ).resolves.toBeUndefined();
    }
  );
});
