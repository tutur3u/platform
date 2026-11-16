import { describe, expect, it, vi } from 'vitest';
import {
  logoutBrowserSessionWithInternalApi,
  logoutSatelliteAppWithInternalApi,
} from './auth-logout';

describe('logout transports', () => {
  it.each([
    [
      'app-only',
      logoutSatelliteAppWithInternalApi,
      'https://learn.tuturuuu.com',
    ],
    [
      'current browser',
      logoutBrowserSessionWithInternalApi,
      'https://tuturuuu.com',
    ],
  ] as const)(
    'posts %s logout once with credentials to the chosen origin',
    async (_scope, logout, baseUrl) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ success: true }));
      await expect(logout({ baseUrl, fetch: fetchMock })).resolves.toEqual({
        success: true,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        `${baseUrl}/api/auth/logout`,
        expect.objectContaining({
          cache: 'no-store',
          credentials: 'include',
          method: 'POST',
        })
      );
    }
  );

  it('rejects a denied app logout without silently treating it as success or retrying', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: 'Denied' }, { status: 403 }));
    await expect(
      logoutSatelliteAppWithInternalApi({
        baseUrl: 'https://learn.tuturuuu.com',
        fetch: fetchMock,
      })
    ).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
