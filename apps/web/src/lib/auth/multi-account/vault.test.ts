import { describe, expect, it } from 'vitest';
import { normalizePersistableMultiAccountRoute } from './routes';
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
