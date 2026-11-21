import { describe, expect, it } from 'vitest';
import {
  desktopDisplayVersion,
  detectDesktopArchitecture,
  detectPlatform,
  parseDesktopTag,
  parseReleaseVersion,
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

  it('recommends a package only when the known architecture can use it', () => {
    const available = ['macos', 'windows', 'linux', 'web'] as const;
    expect(detectDesktopArchitecture('Linux aarch64', null, null)).toBe(
      'arm64'
    );
    expect(detectDesktopArchitecture('Win64; x64', '"arm"', '"64"')).toBe(
      'arm64'
    );
    expect(detectDesktopArchitecture('Win64; x64', null, null)).toBe('x64');
    expect(detectDesktopArchitecture('Linux i686', null, null)).toBe('other');
    expect(resolvePrimaryPlatform('linux', available, 'arm64', 'x64')).toBe(
      'web'
    );
    expect(resolvePrimaryPlatform('windows', available, 'x64', 'x64')).toBe(
      'windows'
    );
    expect(
      resolvePrimaryPlatform('macos', available, 'arm64', 'universal')
    ).toBe('macos');
    expect(resolvePrimaryPlatform('windows', available, null, 'x64')).toBe(
      'web'
    );
    expect(resolvePrimaryPlatform('macos', available, null, 'universal')).toBe(
      'macos'
    );
  });

  it('does not infer x64 from reduced Chromium user agents', () => {
    const windows =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0';
    const linux = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0';
    expect(detectDesktopArchitecture(windows, null, null)).toBeNull();
    expect(detectDesktopArchitecture(linux, null, null)).toBeNull();
    expect(detectDesktopArchitecture(windows, '"x86"', '"64"')).toBe('x64');
    expect(detectDesktopArchitecture(windows, '"arm"', '"64"')).toBe('arm64');
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
    expect(desktopDisplayVersion('desktop-v0.27.27-1000000')).toBe('0.27.27');
  });

  it('reads the build number only from shared-train tags', () => {
    expect(parseDesktopTag('desktop-v0.27.27')).toEqual({
      version: '0.27.27',
      build: null,
    });
    expect(parseDesktopTag('desktop-v0.27.27-1000000')).toEqual({
      version: '0.27.27',
      build: '1000000',
    });
    expect(parseDesktopTag('desktop-v1.0.0-1000004')).toEqual({
      version: '1.0.0',
      build: '1000004',
    });
    expect(parseDesktopTag('desktop-v0.27.26-40215487156')).toEqual({
      version: '0.27.26',
      build: null,
    });
    expect(parseDesktopTag('desktop-v0.26.0-40215487156')).toEqual({
      version: '0.26.0',
      build: null,
    });
  });

  it('parses recorded versions with an optional build', () => {
    expect(parseReleaseVersion('0.27.27')).toEqual({
      version: '0.27.27',
      build: null,
    });
    expect(parseReleaseVersion(' 0.27.27+578001 ')).toEqual({
      version: '0.27.27',
      build: '578001',
    });
    for (const value of ['latest', '0.27', '0.27.27-beta', 27, null])
      expect(parseReleaseVersion(value)).toBeNull();
  });
});
