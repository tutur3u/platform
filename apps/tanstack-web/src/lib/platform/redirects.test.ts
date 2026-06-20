import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildQrGeneratorRedirectHref,
  docsRedirectHref,
  meetTogetherCalendarRedirectHref,
  meetTogetherProductRedirectHref,
  pricingRedirectHref,
} from './redirects';

describe('public redirect helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('preserves the legacy pricing anchor redirect target', () => {
    expect(pricingRedirectHref()).toBe('/?hash-nav=1#pricing');
  });

  it('preserves the legacy docs external redirect target', () => {
    expect(docsRedirectHref()).toBe('https://docs.tuturuuu.com');
  });

  it('preserves the legacy meet-together product redirect target', () => {
    expect(meetTogetherProductRedirectHref()).toBe('/meet-together');
  });

  it('preserves the legacy meet-together calendar redirect target', () => {
    expect(meetTogetherCalendarRedirectHref()).toBe('/meet-together');
    expect(meetTogetherCalendarRedirectHref('plans/summer')).toBe(
      '/meet-together/plans/summer'
    );
    expect(meetTogetherCalendarRedirectHref('/plans/summer/')).toBe(
      '/meet-together/plans/summer'
    );
  });

  it('redirects the QR generator to the QR app origin and preserves query entries', () => {
    vi.stubEnv('QR_APP_URL', 'https://qr.example.com');

    expect(
      buildQrGeneratorRedirectHref('?content=hello&tag=one&tag=two&empty=')
    ).toBe('https://qr.example.com/?content=hello&tag=one&tag=two&empty=');
  });

  it('accepts URLSearchParams input for server-side call sites', () => {
    vi.stubEnv('QR_APP_URL', 'https://qr.example.com');

    const searchParams = new URLSearchParams();
    searchParams.append('url', 'https://tuturuuu.com/docs');

    expect(buildQrGeneratorRedirectHref(searchParams)).toBe(
      'https://qr.example.com/?url=https%3A%2F%2Ftuturuuu.com%2Fdocs'
    );
  });
});
