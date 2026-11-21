import { describe, expect, it } from 'vitest';
import {
  parseReleaseStatus,
  releaseStatusUrl,
  selectHighestRecord,
  shardTagsFromRefs,
} from './app-release-status';

const ios = {
  schema: 1,
  platform: 'ios',
  channel: 'beta',
  store: 'testflight',
  version: '0.27.27',
  build: 1000000,
  label: '0.27.27 (build 1000000)',
  sha: 'a'.repeat(40),
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
      parseReleaseStatus('ios', {
        ...ios,
        label: '0.27.27 (build 1000000, android/ios fix)',
      })?.note
    ).toBe('android/ios fix');
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
    ['a zero build', { ...ios, build: 0 }],
  ])('rejects %s', (_, value) => {
    expect(parseReleaseStatus('ios', value)).toBeNull();
  });

  it.each([null, [], 'ios', 1])('rejects non-object %j', (value) => {
    expect(parseReleaseStatus('ios', value)).toBeNull();
  });

  // The version and build fields are authoritative; a label only adds a note
  // when it wraps exactly that version and build.
  it.each([
    ['describes another version', '0.27.28 (build 1000000, ios fix)'],
    ['describes a longer build', '0.27.27 (build 10000001, ios fix)'],
    ['carries markup', '0.27.27 (build 1000000, <b>)'],
    ['is free-form', 'Download now'],
    ['is missing', undefined],
  ])('shows no note when the label %s', (_, label) => {
    expect(parseReleaseStatus('ios', { ...ios, label })).toEqual({
      version: '0.27.27',
      build: 1000000,
      note: null,
    });
  });

  it('reads the pointer from the fixed status release', () => {
    expect(releaseStatusUrl('android')).toBe(
      'https://github.com/tutur3u/platform/releases/download/app-release-status/android.json'
    );
  });
});

const asset = (name: string, state = 'uploaded') => ({
  name,
  state,
  browser_download_url: 'https://evil.example/ignored.json',
});

describe('immutable record fallback', () => {
  it('takes the highest uploaded record in the newest shard', () => {
    const releases = [
      { tag_name: 'app-release-status', assets: [asset('ios.json')] },
      {
        tag_name: 'app-release-status-ios-2000',
        assets: [asset('ios-1000000.json'), asset('ios-1000003.json')],
      },
      {
        tag_name: 'app-release-status-ios-2001',
        assets: [asset('ios-1000500.json', 'starter')],
      },
      {
        tag_name: 'app-release-status-android-2002',
        assets: [asset('android-1001000.json')],
      },
      { tag_name: 'desktop-v0.27.27-1000000', assets: [] },
    ];
    expect(selectHighestRecord('ios', releases)).toEqual({
      url: 'https://github.com/tutur3u/platform/releases/download/app-release-status-ios-2000/ios-1000003.json',
      build: 1000003,
    });
    expect(selectHighestRecord('android', releases)?.build).toBe(1001000);
    expect(selectHighestRecord('desktop', releases)).toBeNull();
  });

  it.each([
    [
      'a foreign platform record',
      'app-release-status-ios-2000',
      'android-1.json',
    ],
    ['a traversal name', 'app-release-status-ios-2000', '../ios-9.json'],
    ['a non-numeric build', 'app-release-status-ios-2000', 'ios-latest.json'],
    ['a look-alike tag', 'app-release-status-ios-2000-x', 'ios-9.json'],
  ])('ignores %s', (_, tag_name, name) => {
    expect(
      selectHighestRecord('ios', [{ tag_name, assets: [asset(name)] }])
    ).toBeNull();
  });

  it('handles malformed listings', () => {
    expect(selectHighestRecord('ios', null)).toBeNull();
    expect(selectHighestRecord('ios', [null, 1, { tag_name: 3 }])).toBeNull();
  });
});

describe('shard tags', () => {
  it("lists a platform's shard tags, highest first", () => {
    expect(
      shardTagsFromRefs('ios', [
        { ref: 'refs/tags/app-release-status-ios-2000' },
        { ref: 'refs/tags/app-release-status-ios-2002' },
        { ref: 'refs/tags/app-release-status-android-2003' },
        { ref: 'refs/tags/app-release-status' },
        { ref: 'refs/tags/app-release-status-ios-2001-x' },
        { ref: 'refs/heads/app-release-status-ios-2009' },
        null,
      ])
    ).toEqual(['app-release-status-ios-2002', 'app-release-status-ios-2000']);
    expect(shardTagsFromRefs('ios', { message: 'API rate limit' })).toEqual([]);
  });
});
