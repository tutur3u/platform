import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getReleaseCandidates } from './release-candidates.server';

afterEach(() => vi.unstubAllGlobals());

const shas = ['a', 'b', 'c', 'd'].map((c) => c.repeat(40));
const refs = shas.map((s) => ({
  ref: `refs/heads/release-candidate/${s}`,
  object: { sha: s },
}));
const runsFor = (s: string, at: string) => ({
  workflow_runs: [
    {
      id: 1,
      name: 'CI',
      path: 'ci.yaml',
      event: 'workflow_dispatch',
      head_branch: `release-candidate/${s}`,
      head_sha: s,
      status: 'completed',
      conclusion: 'success',
      created_at: at,
      html_url: 'https://github.com/tutur3u/platform/actions/runs/1',
    },
  ],
});

describe('getReleaseCandidates', () => {
  it('reads at most six resources and sorts newest first', async () => {
    const request = vi.fn(async (url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => {
        if (url.includes('matching-refs')) return refs;
        const s = /head_sha=([0-9a-f]{40})/.exec(url)![1]!;
        return runsFor(
          s,
          `2026-11-2${'abcd'.indexOf(s.charAt(0)) + 1}T00:00:00Z`
        );
      },
    }));
    vi.stubGlobal('fetch', request);
    const result = await getReleaseCandidates();
    expect(result.available).toBe(true);
    // Lexically first but oldest: the newest three by run time are kept.
    expect(result.candidates.map((c) => c.sha)).toEqual([
      shas[3],
      shas[2],
      shas[1],
    ]);
    expect(request.mock.calls.length).toBeLessThanOrEqual(6);
    expect(
      request.mock.calls.every(
        ([url, options]) =>
          url.startsWith('https://api.github.com/repos/tutur3u/platform/') &&
          options?.redirect === 'manual' &&
          options?.cache === 'no-store'
      )
    ).toBe(true);
  });
  it('is unavailable when the refs call fails or throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await getReleaseCandidates()).toEqual({
      available: false,
      candidates: [],
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('x')));
    expect((await getReleaseCandidates()).available).toBe(false);
  });
  it('marks a candidate unknown when its runs call fails', async () => {
    const request = vi.fn(async (url: string) =>
      url.includes('matching-refs')
        ? { ok: true, json: async () => refs.slice(0, 1) }
        : { ok: false }
    );
    vi.stubGlobal('fetch', request);
    const result = await getReleaseCandidates();
    expect(result.available).toBe(true);
    expect(result.candidates[0]?.verdict).toBe('unknown');
    expect(request).toHaveBeenCalledTimes(2);
  });
});
