import { describe, expect, it } from 'vitest';
import {
  DESKTOP_ASSETS,
  findDesktopRelease,
  parseDesktopRelease,
} from './desktop-downloads';

const tag = 'desktop-v0.9.2-123';
const base = 'https://github.com/tutur3u/platform/releases';
function release() {
  return {
    tag_name: tag,
    draft: false,
    prerelease: true,
    html_url: `${base}/tag/${tag}`,
    assets: Object.values(DESKTOP_ASSETS).map((name) => ({
      name,
      state: 'uploaded',
      size: 12345,
      digest: `sha256:${'a'.repeat(64)}`,
      browser_download_url: `${base}/download/${tag}/${name}`,
    })),
  };
}

describe('public desktop downloads', () => {
  it('selects a complete release with provider checksums', () => {
    expect(parseDesktopRelease(release())?.downloads).toHaveLength(3);
    expect(
      findDesktopRelease([{ ...release(), draft: true }, release()])?.tag
    ).toBe(tag);
  });
  it('preserves the latest available package per platform across independent releases', () => {
    const linux = { ...release(), assets: release().assets.slice(2) };
    expect(
      parseDesktopRelease(linux)?.downloads.map((download) => download.platform)
    ).toEqual(['linux']);
    const older = release();
    const combined = findDesktopRelease([linux, older]);
    expect(combined?.downloads).toHaveLength(3);
    expect(combined?.downloads[0]?.platform).toBe('linux');
  });
  it('rejects empty, draft, duplicate and unverified assets', () => {
    expect(parseDesktopRelease({ ...release(), draft: true })).toBeNull();
    expect(parseDesktopRelease({ ...release(), assets: [] })).toBeNull();
    expect(
      parseDesktopRelease({
        ...release(),
        assets: [...release().assets, release().assets[0]],
      })
    ).toBeNull();
    for (const change of [
      { digest: null },
      { state: 'new' },
      { size: -1 },
      { size: 1.5 },
    ]) {
      const input = release();
      Object.assign(input.assets[0]!, change);
      expect(parseDesktopRelease(input)).toBeNull();
    }
  });
  it('rejects external, credential-bearing, traversal, and unrelated release links', () => {
    for (const url of [
      'https://evil.test/app.exe',
      `${base}/download/${tag}/../secret`,
      `https://github.com@evil.test/app`,
    ]) {
      const input = release();
      input.assets[0]!.browser_download_url = url;
      expect(parseDesktopRelease(input)).toBeNull();
    }
    expect(
      parseDesktopRelease({ ...release(), html_url: 'https://evil.test' })
    ).toBeNull();
    expect(
      parseDesktopRelease({ ...release(), tag_name: '../main' })
    ).toBeNull();
    expect(
      parseDesktopRelease({ ...release(), tag_name: 'v0.9.2' })
    ).toBeNull();
  });
  it('handles unavailable or malformed provider results safely', () => {
    for (const value of [null, {}, 'error', [], [null, {}, []]]) {
      expect(findDesktopRelease(value)).toBeNull();
    }
  });
});
