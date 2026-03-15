import { resolveTurnstileClientState } from './client';

describe('resolveTurnstileClientState', () => {
  it('requires Turnstile outside development when configured', () => {
    expect(
      resolveTurnstileClientState({
        devMode: false,
        siteKey: 'site-key',
      })
    ).toEqual({
      siteKey: 'site-key',
      isRequired: true,
      canRenderWidget: true,
    });
  });

  it('stays required but non-renderable when the site key is missing', () => {
    expect(
      resolveTurnstileClientState({
        devMode: false,
        siteKey: null,
      })
    ).toEqual({
      siteKey: undefined,
      isRequired: true,
      canRenderWidget: false,
    });
  });

  it('disables Turnstile in development', () => {
    expect(
      resolveTurnstileClientState({
        devMode: true,
        siteKey: 'site-key',
      })
    ).toEqual({
      siteKey: 'site-key',
      isRequired: false,
      canRenderWidget: false,
    });
  });
});
