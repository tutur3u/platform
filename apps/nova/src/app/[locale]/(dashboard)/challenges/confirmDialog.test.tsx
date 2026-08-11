import { afterEach, describe, expect, it, vi } from 'vitest';
import { challengeHasProblems } from './confirmDialog';

describe('challenge confirmation problem availability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the bounded availability contract instead of downloading problems', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ hasProblems: true }), { status: 200 })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(challengeHasProblems('challenge-1')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/problems?challengeId=challenge-1&availability=true'
    );
  });

  it('fails closed when availability cannot be confirmed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    );
    await expect(challengeHasProblems('challenge-1')).resolves.toBe(false);
  });
});
