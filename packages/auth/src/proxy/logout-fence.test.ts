import { describe, expect, it, vi } from 'vitest';
import { APP_LOGOUT_COOKIE_NAME } from '../app-session-core';
import { withAppLogoutFence } from './logout-fence';

describe('app-only logout refresh', () => {
  it('never calls the provider or central refresh while the app is signed out', async () => {
    const resolve = vi.fn();
    const request = new Request('https://learn.tuturuuu.com/personal', {
      headers: {
        cookie: `${APP_LOGOUT_COOKIE_NAME}=1; sb-shared-auth-token=central-fixture`,
      },
    });
    await expect(withAppLogoutFence(request, resolve)).resolves.toEqual({
      ok: false,
      error: 'App signed out',
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('retains normal refresh when this host has no signed-out marker', async () => {
    const result = { ok: false as const, error: 'Fixture result' };
    const resolve = vi.fn().mockResolvedValue(result);
    await expect(
      withAppLogoutFence(
        new Request('https://tasks.tuturuuu.com/personal'),
        resolve
      )
    ).resolves.toBe(result);
    expect(resolve).toHaveBeenCalledOnce();
  });
});
