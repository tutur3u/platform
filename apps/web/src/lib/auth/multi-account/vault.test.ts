import { describe, expect, it } from 'vitest';
import {
  normalizePersistableMultiAccountRoute,
  resolveMultiAccountAddRedirect,
  resolveMultiAccountSwitchRedirect,
} from './routes';
import { normalizeMultiAccountRedirectPath } from './vault';

describe('web multi-account vault helpers', () => {
  const request = {
    url: 'https://tuturuuu.localhost/login',
  };

  it('keeps safe relative redirects', () => {
    expect(
      normalizeMultiAccountRedirectPath(
        '/en/personal/tasks?view=board',
        request
      )
    ).toBe('/en/personal/tasks?view=board');
  });

  it('converts same-origin absolute redirects to relative paths', () => {
    expect(
      normalizeMultiAccountRedirectPath(
        'https://tuturuuu.localhost/en/personal/tasks#today',
        request
      )
    ).toBe('/en/personal/tasks#today');
  });

  it('rejects cross-origin redirects', () => {
    expect(
      normalizeMultiAccountRedirectPath('https://evil.example/path', request)
    ).toBe('/');
  });

  it('does not persist login callback URLs as account return routes', () => {
    expect(
      normalizePersistableMultiAccountRoute(
        '/login?code=oauth-code&returnUrl=%2Fen%2Fpersonal%2Ftasks',
        request
      )
    ).toBe(null);
  });

  it('does not persist add-account completion URLs as account return routes', () => {
    expect(
      normalizePersistableMultiAccountRoute(
        '/add-account?returnUrl=%2Fen%2Fpersonal%2Ftasks',
        request
      )
    ).toBe(null);
  });
});

describe('resolveMultiAccountSwitchRedirect', () => {
  const request = { url: 'https://tuturuuu.localhost/login' };

  // Regression: switching accounts from the "continue to <app>" screen sent the
  // user to the dashboard, abandoning the external app sign-in they started.
  // The target was being run through the persistable-route filter, which drops
  // `/login` on purpose — correct for what we store, wrong for where we go next.
  it('resumes a pending external sign-in instead of dropping it', () => {
    expect(
      resolveMultiAccountSwitchRedirect(
        {
          lastRoute: '/en/personal/tasks',
          targetRoute:
            '/en/login?returnUrl=https%3A%2F%2Fyashie.example%2Fdashboard',
        },
        request
      )
    ).toBe('/en/login?returnUrl=https%3A%2F%2Fyashie.example%2Fdashboard');
  });

  // The nested return URL is carried through untouched; decoding it here would
  // let its own `&`-separated parameters escape into the login page's query.
  it('preserves the encoding of a nested return URL', () => {
    expect(
      resolveMultiAccountSwitchRedirect(
        {
          targetRoute: `/login?returnUrl=${encodeURIComponent(
            'https://yashie.example/auth?state=abc&code=xyz'
          )}`,
        },
        request
      )
    ).toBe(
      '/login?returnUrl=https%3A%2F%2Fyashie.example%2Fauth%3Fstate%3Dabc%26code%3Dxyz'
    );
  });

  it('falls back to the account last route when no target is given', () => {
    expect(
      resolveMultiAccountSwitchRedirect(
        { lastRoute: '/en/personal/tasks' },
        request
      )
    ).toBe('/en/personal/tasks');
  });

  it('never leaves the origin, even when asked to', () => {
    expect(
      resolveMultiAccountSwitchRedirect(
        { lastRoute: null, targetRoute: 'https://evil.example/path' },
        request
      )
    ).toBe('/');
  });
});

describe('resolveMultiAccountAddRedirect', () => {
  const request = { url: 'https://tuturuuu.localhost/add-account' };

  // Regression: an external app's returnUrl is cross-origin, so it normalized to
  // `/` and the freshly added account landed on the dashboard with the sign-in
  // it was added for forgotten. Hand it back to /login, which mints the token.
  it('hands a cross-origin return back to the login handoff', () => {
    expect(
      resolveMultiAccountAddRedirect(
        'https://yashie.example/dashboard',
        request
      )
    ).toBe('/login?returnUrl=https%3A%2F%2Fyashie.example%2Fdashboard');
  });

  it('navigates straight to a same-origin return', () => {
    expect(
      resolveMultiAccountAddRedirect(
        'https://tuturuuu.localhost/en/personal/tasks',
        request
      )
    ).toBe('/en/personal/tasks');
  });

  it('goes home when there is nothing to resume', () => {
    expect(resolveMultiAccountAddRedirect(null, request)).toBe('/');
    expect(resolveMultiAccountAddRedirect('javascript:alert(1)', request)).toBe(
      '/'
    );
    expect(resolveMultiAccountAddRedirect('not a url', request)).toBe('/');
  });
});
