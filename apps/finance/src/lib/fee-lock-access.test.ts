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
    consoleError.mockRestore();
  });
});
