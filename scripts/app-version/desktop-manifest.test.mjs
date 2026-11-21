import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addsDesktopManifestAssets,
  readDesktopManifest,
} from './desktop-manifest.mjs';

const status = {
  platform: 'desktop',
  version: '0.27.29',
  build: 1000002,
  sha: 'a'.repeat(40),
};
const tag = 'desktop-v0.27.29-1000002';
const base = 'https://github.com/tutur3u/platform/releases';
const asset = (name) => ({
  name,
  state: 'uploaded',
  browser_download_url: `${base}/download/${tag}/${name}`,
  digest: `sha256:${'b'.repeat(64)}`,
  size: 25,
});
const linux = asset('Tuturuuu-linux-x64.deb');
const windows = asset('Tuturuuu-windows-x64-setup.exe');
const release = {
  tag_name: tag,
  target_commitish: status.sha,
  html_url: `${base}/tag/${tag}`,
  draft: false,
  prerelease: true,
  assets: [linux],
};

test('derives the public manifest from the exact published ledger release', async () => {
  const manifest = await readDesktopManifest(async (path) => {
    assert.equal(path, `/repos/tutur3u/platform/releases/tags/${tag}`);
    return {
      ...release,
      assets: [linux, windows],
      body: '## Known issues\n- Windows packages are UNSIGNED for now. SmartScreen may warn.',
    };
  }, status);
  assert.deepEqual(manifest, {
    tag_name: tag,
    html_url: release.html_url,
    draft: false,
    prerelease: true,
    body: '- Windows packages are UNSIGNED for now.',
    assets: [linux, windows],
  });
});

test('rejects drafts, source mismatch, duplicate packages, and invalid asset metadata', async () => {
  for (const patch of [
    { draft: true },
    { target_commitish: 'f'.repeat(40) },
    { assets: [linux, linux] },
    { assets: [{ ...linux, state: 'starter' }] },
    {
      assets: [
        { ...linux, browser_download_url: 'https://example.com/app.deb' },
      ],
    },
    { assets: [{ ...linux, digest: null }] },
  ]) {
    await assert.rejects(() =>
      readDesktopManifest(async () => ({ ...release, ...patch }), status)
    );
  }
});

test('same-build status updates can add packages without replacing existing bytes', () => {
  const withAssets = (assets) => ({ ...status, desktopRelease: { assets } });
  const published = withAssets([linux]);
  assert.equal(addsDesktopManifestAssets(status, published), true);
  assert.equal(
    addsDesktopManifestAssets(published, withAssets([linux, windows])),
    true
  );
  assert.equal(
    addsDesktopManifestAssets(published, withAssets([windows])),
    false
  );
  assert.equal(
    addsDesktopManifestAssets(
      published,
      withAssets([{ ...linux, digest: windows.digest + '0' }, windows])
    ),
    false
  );
});
