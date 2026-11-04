import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifySecret: vi.fn() }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifySecret: mocks.verifySecret,
}));

import { FEE_LOCK_SECRET, isFeeLockEnabled } from './fee-lock-access';

const WS_ID = '00000000-0000-4000-8000-00000000f1c0';

describe('isFeeLockEnabled', () => {
  beforeEach(() => {
    mocks.verifySecret.mockReset();
  });

  it('reads the root-admin ENABLE_FEE_LOCK secret', async () => {
    mocks.verifySecret.mockResolvedValue(true);
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(true);
    expect(mocks.verifySecret).toHaveBeenCalledWith({
      wsId: WS_ID,
      forceAdmin: true,
      name: FEE_LOCK_SECRET,
      value: 'true',
    });
  });

  it('returns false when the flag is off', async () => {
    mocks.verifySecret.mockResolvedValue(false);
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(false);
  });

  it('fails closed instead of throwing when the lookup fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mocks.verifySecret.mockRejectedValue(new Error('secrets unavailable'));
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      '[fee-lock] flag lookup failed; treating as off:',
      'secrets unavailable'
    );
    consoleError.mockRestore();
  });

  it('logs only the message of a Supabase-style error, never its body', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mocks.verifySecret.mockRejectedValue({
      code: 'PGRST301',
      details: 'synthetic-secret-details',
      hint: 'synthetic-hint',
      message: 'JWT expired',
    });
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      '[fee-lock] flag lookup failed; treating as off:',
      'JWT expired'
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      'synthetic-secret-details'
    );
    consoleError.mockRestore();
  });

  it('logs a placeholder when the thrown value has no message', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mocks.verifySecret.mockRejectedValue('boom');
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      '[fee-lock] flag lookup failed; treating as off:',
      'unknown error'
    );
    consoleError.mockRestore();
  });
});
