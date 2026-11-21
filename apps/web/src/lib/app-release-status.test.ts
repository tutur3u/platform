import { describe, expect, it } from 'vitest';
import { parseReleaseStatus, releaseStatusUrl } from './app-release-status';

const ios = {
  schema: 1,
  platform: 'ios',
  channel: 'beta',
  store: 'testflight',
  version: '0.27.27',
  build: 1000000,
  label: '0.27.27 (build 1000000)',
  sha: 'abc123',
  publishedAt: '2026-11-21T03:00:00Z',
};

describe('beta release status files', () => {
  it('reads a verified status for its platform', () => {
    expect(parseReleaseStatus('ios', ios)).toEqual({
      version: '0.27.27',
      build: 1000000,
      note: null,
    });
    expect(
      parseReleaseStatus('android', {
        ...ios,
        platform: 'android',
        store: 'google-play-internal',
        build: 1000001,
        label: '0.27.27 (build 1000001, android fix)',
      })?.note
    ).toBe('android fix');
    expect(
      parseReleaseStatus('desktop', {
        ...ios,
        platform: 'desktop',
        store: 'github-release',
      })?.build
    ).toBe(1000000);
  });

  it.each([
    ['another platform', { ...ios, platform: 'android' }],
    ['another store', { ...ios, store: 'app-store' }],
    ['a public channel', { ...ios, channel: 'public' }],
    ['an unknown schema', { ...ios, schema: 2 }],
    ['a non-semver version', { ...ios, version: 'latest' }],
    ['a fractional build', { ...ios, build: 1.5 }],
    ['a string build', { ...ios, build: '1000000' }],
    ['a mismatched label', { ...ios, label: '0.27.28 (build 1000000)' }],
    ['a label for a longer build', { ...ios, build: 100 }],
    [
      'a label with extra build digits',
      { ...ios, label: '0.27.27 (build 10000001)' },
    ],
    ['markup in the label', { ...ios, label: '0.27.27 (build 1000000, <b>)' }],
    ['a free-form label', { ...ios, label: 'Download now' }],
  ])('rejects %s', (_, value) => {
    expect(parseReleaseStatus('ios', value)).toBeNull();
  });

  it.each([null, [], 'ios', 1])('rejects non-object %j', (value) => {
    expect(parseReleaseStatus('ios', value)).toBeNull();
  });

  it('reads from the fixed status release', () => {
    expect(releaseStatusUrl('android')).toBe(
      'https://github.com/tutur3u/platform/releases/download/app-release-status/android.json'
    );
  });
});
