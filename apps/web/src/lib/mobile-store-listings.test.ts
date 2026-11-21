import { describe, expect, it } from 'vitest';
import { resolveMobileChannels } from './mobile-store-listings';

const testing = 'https://play.google.com/apps/testing/com.tuturuuu.app.mobile';
const details =
  'https://play.google.com/store/apps/details?id=com.tuturuuu.app.mobile';

describe('mobile download channels', () => {
  it('treats an App Store listing as the store channel', () => {
    expect(
      resolveMobileChannels('ios', {
        storeUrl: 'https://apps.apple.com/app/id1',
        effectiveVersion: '0.27.27',
      })
    ).toEqual({
      store: {
        url: 'https://apps.apple.com/app/id1',
        release: { version: '0.27.27', build: null },
      },
      betaUrl: null,
    });
  });

  it('treats a TestFlight link as the beta channel only', () => {
    expect(
      resolveMobileChannels('ios', {
        storeUrl: 'https://testflight.apple.com/join/abc',
        effectiveVersion: '0.27.20',
      })
    ).toEqual({
      store: null,
      betaUrl: 'https://testflight.apple.com/join/abc',
    });
  });

  it('offers no iOS channel without a trusted link', () => {
    expect(
      resolveMobileChannels('ios', { storeUrl: 'https://evil.example/app' })
    ).toEqual({ store: null, betaUrl: null });
  });

  it('keeps Android on Play testing until the listing is public', () => {
    expect(resolveMobileChannels('android', { storeUrl: details })).toEqual({
      store: null,
      betaUrl: testing,
    });
    expect(resolveMobileChannels('android', {})).toEqual({
      store: null,
      betaUrl: testing,
    });
    expect(
      resolveMobileChannels(
        'android',
        { storeUrl: details, effectiveVersion: '1.0.0' },
        { androidPubliclyListed: true }
      )
    ).toEqual({
      store: { url: details, release: { version: '1.0.0', build: null } },
      betaUrl: testing,
    });
  });
});
