import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifySecret = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/utils/workspace-helper', () => ({ verifySecret }));

import {
  feeLockNotFoundResponse,
  isFeeLockEnabled,
  requireFeeLockEnabled,
} from './access';
import { FEE_LOCK_ENABLED_SECRET } from './constants';

const WS_ID = '00000000-0000-4000-8000-0000000000f1';

describe('fee-lock flag', () => {
  beforeEach(() => verifySecret.mockReset());

  it('reads ENABLE_FEE_LOCK with the admin client and requires "true"', async () => {
    verifySecret.mockResolvedValue(true);
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(true);
    expect(verifySecret).toHaveBeenCalledWith({
      wsId: WS_ID,
      forceAdmin: true,
      name: FEE_LOCK_ENABLED_SECRET,
      value: 'true',
    });
    expect(FEE_LOCK_ENABLED_SECRET).toBe('ENABLE_FEE_LOCK');
  });

  it('fails closed when the secret is missing or the lookup throws', async () => {
    verifySecret.mockResolvedValueOnce(false);
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(false);
    verifySecret.mockRejectedValueOnce(new Error('db down'));
    await expect(isFeeLockEnabled(WS_ID)).resolves.toBe(false);
  });

  it('returns a 404 while off and null while on', async () => {
    verifySecret.mockResolvedValueOnce(false);
    const blocked = await requireFeeLockEnabled(WS_ID);
    expect(blocked?.status).toBe(404);
    await expect(blocked?.json()).resolves.toEqual({ error: 'Not found' });

    verifySecret.mockResolvedValueOnce(true);
    await expect(requireFeeLockEnabled(WS_ID)).resolves.toBeNull();
    expect(feeLockNotFoundResponse().status).toBe(404);
  });
});
