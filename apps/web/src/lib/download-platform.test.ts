import { describe, expect, it } from 'vitest';
import {
  desktopDisplayVersion,
  detectPlatform,
  parseStoreListing,
  refinePlatform,
  resolvePrimaryPlatform,
} from './download-platform';

describe('download platform detection', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      'ios',
    ],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36', 'android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'windows'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      'macos',
    ],
    [
      'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:140.0) Gecko/20100101',
      'linux',
    ],
    ['Mozilla/5.0 (X11; CrOS x86_64 16000.0.0) AppleWebKit/537.36', 'web'],
    ['curl/8.0', 'web'],
    [null, 'web'],
  ])('maps %s to %s', (ua, platform) => {
    expect(detectPlatform(ua)).toBe(platform);
  });

  it('refines iPadOS desktop user agents and unknown agents on the client', () => {
    expect(refinePlatform('macos', { maxTouchPoints: 5 })).toBe('ios');
    expect(refinePlatform('macos', { maxTouchPoints: 0 })).toBe('macos');
    expect(refinePlatform('web', { uaPlatform: 'Windows' })).toBe('windows');
    expect(refinePlatform('linux', { uaPlatform: 'Android' })).toBe('linux');
  });

  it('falls back to the browser when no build exists', () => {
    expect(resolvePrimaryPlatform('linux', ['ios', 'web'])).toBe('web');
    expect(resolvePrimaryPlatform('ios', ['ios', 'web'])).toBe('ios');
  });
});

describe('store listings', () => {
  it('accepts first-party Apple hosts and real versions only', () => {
    expect(
      parseStoreListing(
        'ios',
        'https://testflight.apple.com/join/abc',
        '0.22.4'
      )
    ).toEqual({
      url: 'https://testflight.apple.com/join/abc',
      version: '0.22.4',
      kind: 'beta',
    });
    expect(
      parseStoreListing('ios', 'https://apps.apple.com/app/id1', 'latest')
    ).toMatchObject({ kind: 'store', version: null });
    expect(parseStoreListing('ios', 'not a url', null)).toBe(null);
  });

  it('sends Android to closed testing until the listing is public', () => {
    const details =
      'https://play.google.com/store/apps/details?id=com.tuturuuu.app.mobile';
    expect(parseStoreListing('android', details, '0.22.4')).toEqual({
      url: 'https://play.google.com/apps/testing/com.tuturuuu.app.mobile',
      version: '0.22.4',
      kind: 'beta',
    });
    expect(
      parseStoreListing('android', details, null, {
        androidPubliclyListed: true,
      })
    ).toMatchObject({ url: details, kind: 'store' });
    expect(
      parseStoreListing(
        'android',
        'https://play.google.com/apps/testing/com.tuturuuu.app.mobile',
        null
      )?.url
    ).toBe('https://play.google.com/apps/testing/com.tuturuuu.app.mobile');
  });

  it.each([
    ['ios', 'https://user:pass@apps.apple.com/app/id1'],
    ['ios', 'https://apps.apple.com@evil.example/app/id1'],
    ['ios', 'https://apps.apple.com:8443/app/id1'],
    ['ios', 'https://apps.apple.com.evil.example/app/id1'],
    // Cyrillic lookalikes (IDN) punycode to a different hostname.
    ['ios', 'https://\u0430pps.apple.com/app/id1'],
    ['ios', 'https://evil.example/app'],
    ['android', 'http://play.google.com/apps/testing/com.tuturuuu.app.mobile'],
    ['android', 'https://play.google.com:444/apps/testing/com.example.app'],
    ['android', 'https://pl\u0430y.google.com/apps/testing/com.example.app'],
    ['android', 'https://play.google.com/store/apps/details?id=bad id'],
    ['android', 'https://play.google.com/store/apps/details'],
    ['android', 'https://play.google.com/store/search?q=tuturuuu'],
  ] as const)('rejects %s link %s', (platform, url) => {
    expect(parseStoreListing(platform, url, '1.0.0')).toBe(null);
  });

  it('drops the CI run suffix from desktop tags', () => {
    expect(desktopDisplayVersion('desktop-v0.26.0-40215487156')).toBe('0.26.0');
    expect(desktopDisplayVersion('desktop-v0.26.1')).toBe('0.26.1');
  });
});
