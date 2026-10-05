import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getDesktopDeploymentStatus } from './status.server';

afterEach(() => vi.unstubAllGlobals());
describe('desktop metadata reader', () => {
  it('treats unavailable metadata as unknown and does not query jobs without a verified run', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', request);
    expect(await getDesktopDeploymentStatus()).toEqual({
      run: null,
      packages: [],
      jobs: [],
      releasesAvailable: false,
      jobsAvailable: false,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(
      request.mock.calls.every(
        ([url, options]) =>
          url.startsWith('https://api.github.com/repos/tutur3u/platform/') &&
          options.redirect === 'error' &&
          options.cache === 'no-store'
      )
    ).toBe(true);
  });
  it('rejects unrelated runs instead of following external URLs', async () => {
    const request = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          workflow_runs: [
            {
              id: 42,
              head_branch: 'main',
              path: '.github/workflows/desktop-beta.yaml',
              head_sha: 'a'.repeat(40),
              status: 'completed',
              conclusion: 'success',
              html_url: 'https://untrusted.example',
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', request);
    expect((await getDesktopDeploymentStatus()).run).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
