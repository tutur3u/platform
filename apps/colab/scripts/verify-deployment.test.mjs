import { describe, expect, it, vi } from 'vitest';
import { waitForDeployment } from './verify-deployment.mjs';

describe('Cloudflare rollout verification', () => {
  it('waits for the new assets to replace the old edge response', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new Error('Asset mismatch'))
      .mockResolvedValue('verified');
    const sleep = vi.fn();
    expect(await waitForDeployment(check, { sleep })).toBe('verified');
    expect(sleep).toHaveBeenCalledWith(5000);
  });
  it('fails the deployment when the mismatch never clears', async () => {
    const check = vi.fn().mockRejectedValue(new Error('Asset mismatch'));
    await expect(
      waitForDeployment(check, { attempts: 3, sleep: vi.fn() })
    ).rejects.toThrow('Asset mismatch');
    expect(check).toHaveBeenCalledTimes(3);
  });
});
