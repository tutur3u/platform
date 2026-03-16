import { resolveTurnstileClientState } from './client';

describe('resolveTurnstileClientState', () => {
  it('requires Turnstile outside development when configured', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';
    expect(
      resolveTurnstileClientState({
        devMode: false,
      })
    ).toEqual({
      siteKey: 'site-key',
      isRequired: true,
      canRenderWidget: true,
    });
  });

  it('stays required but non-renderable when the site key is missing', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '';
    expect(
      resolveTurnstileClientState({
        devMode: false,
      })
    ).toEqual({
      siteKey: undefined,
      isRequired: true,
      canRenderWidget: false,
    });
  });

  it('disables Turnstile in development', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';
    expect(
      resolveTurnstileClientState({
        devMode: true,
      })
    ).toEqual({
      siteKey: 'site-key',
      isRequired: false,
      canRenderWidget: false,
    });
  });
});
