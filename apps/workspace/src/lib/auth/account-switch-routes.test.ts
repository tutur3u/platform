import { describe, expect, it } from 'vitest';
import {
  isPersistableMultiAccountRoutePath,
  resolveMultiAccountSwitchRedirect,
} from './account-switch-routes';

const request = { url: 'https://workspace.tuturuuu.com/api/auth/switch' };

describe('account switch routes', () => {
  it('keeps the workspace domains route instead of falling back to the workspace home', () => {
    expect(
      resolveMultiAccountSwitchRedirect(
        { targetRoute: '/personal/domains' },
        request
      )
    ).toBe('/personal/domains');
  });

  it('maps a route Web does not own to the workspace home', () => {
    expect(
      resolveMultiAccountSwitchRedirect(
        { targetRoute: '/personal/not-a-web-route' },
        request
      )
    ).toBe('/personal');
  });

  it('never persists auth surfaces as a return route', () => {
    for (const path of ['/login', '/add-account', '/auth/recovery', '/api/v1'])
      expect(isPersistableMultiAccountRoutePath(path)).toBe(false);
  });
});
