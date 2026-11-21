import { describe, expect, it } from 'vitest';
import { parseDesktopReleaseAssets } from './desktop-release-assets';

const tag = 'desktop-v0.27.29-1000002';
const mac = 'Tuturuuu-macos-universal.dmg';
const windows = 'Tuturuuu-windows-x64-setup.exe';
const path = `/tutur3u/platform/releases/download/${tag}/${mac}`;
const digest = 'b'.repeat(64);
const link = `<a href="${path}"><span>${mac}</span></a>`;
const checksum = `<clipboard-copy aria-label="Copy to clipboard digest for ${mac}" value="sha256:${digest}"></clipboard-copy>`;

describe('public GitHub desktop asset listing', () => {
  it('builds a first-party download from its exact row and provider checksum', () => {
    const listing = `<ul><li><div>${link}</div><div>${checksum}</div></li>
      <li><a href="/tutur3u/platform/archive/refs/tags/${tag}.zip">Source code</a></li></ul>`;
    expect(parseDesktopReleaseAssets(tag, listing)?.downloads).toEqual([
      {
        platform: 'macos',
        architecture: 'universal',
        minimumOs: '12',
        size: null,
        unsigned: false,
        tag,
        releaseUrl: `https://github.com/tutur3u/platform/releases/tag/${tag}`,
        url: `https://github.com${path}`,
        sha256: digest,
      },
    ]);
  });

  it('rejects missing links, missing and misbound checksums, and repeated rows', () => {
    for (const listing of [
      `<li>${link}</li><li>${checksum}</li>`,
      `<li>${link}${checksum.replace(mac, windows)}</li>`,
      `<li>${link.replace(path, `https://evil.example${path}`)}${checksum}</li>`,
      `<li>${link}${checksum.replace(digest, 'bad')}</li>`,
      `<li>${link}${checksum}</li><li>${link}${checksum}</li>`,
      `<li>${link}${link}${checksum}</li>`,
    ]) {
      expect(parseDesktopReleaseAssets(tag, listing)).toBeNull();
    }
    expect(
      parseDesktopReleaseAssets('../main', `<li>${link}${checksum}</li>`)
    ).toBeNull();
  });
});
