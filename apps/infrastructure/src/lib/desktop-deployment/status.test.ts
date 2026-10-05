import { describe, expect, it } from 'vitest';
import {
  DESKTOP_WORKFLOW,
  parseDesktopJobs,
  parseDesktopPackages,
  parseDesktopRun,
} from './status';

const digest = `sha256:${'a'.repeat(64)}`;
const run = {
  id: 42,
  head_branch: 'production',
  path: DESKTOP_WORKFLOW,
  head_sha: 'a'.repeat(40),
  status: 'completed',
  conclusion: 'success',
};
const release = {
  draft: false,
  prerelease: true,
  tag_name: 'desktop-v0.23.0-42',
  html_url:
    'https://github.com/tutur3u/platform/releases/tag/desktop-v0.23.0-42',
  assets: [
    {
      name: 'Tuturuuu-linux-x64.deb',
      state: 'uploaded',
      size: 100,
      digest,
      browser_download_url:
        'https://github.com/tutur3u/platform/releases/download/desktop-v0.23.0-42/Tuturuuu-linux-x64.deb',
    },
  ],
};
describe('desktop deployment public metadata', () => {
  it('constructs workflow URLs only for exact production workflow identity', () => {
    expect(
      parseDesktopRun({ ...run, html_url: 'https://untrusted.example' })?.url
    ).toBe('https://github.com/tutur3u/platform/actions/runs/42');
    for (const change of [
      { head_branch: 'main' },
      { path: '.github/workflows/other.yaml' },
      { head_sha: 'short' },
      { id: -1 },
      { status: 'unknown' },
    ])
      expect(parseDesktopRun({ ...run, ...change })).toBeNull();
  });
  it('requires published exact repository assets with checksum and unique identity', () => {
    expect(parseDesktopPackages([release])).toEqual([
      expect.objectContaining({ platform: 'linux', digest: 'a'.repeat(64) }),
    ]);
    for (const change of [
      { draft: true },
      { prerelease: false },
      { html_url: 'https://untrusted.example' },
      { assets: [{ ...release.assets[0], digest: null }] },
      {
        assets: [
          {
            ...release.assets[0],
            browser_download_url: 'https://untrusted.example',
          },
        ],
      },
      { assets: [release.assets[0], release.assets[0]] },
    ])
      expect(parseDesktopPackages([{ ...release, ...change }])).toEqual([]);
  });
  it('retains an earlier available platform artifact when a newer release lacks it', () => {
    expect(
      parseDesktopPackages([
        { ...release, tag_name: 'desktop-v0.23.1-43', assets: [] },
        release,
      ])[0]?.tag
    ).toBe(release.tag_name);
  });
  it('never infers provenance verification from a successful job or missing gate', () => {
    const job = { name: 'Publish', status: 'completed', conclusion: 'success' };
    expect(parseDesktopJobs({ jobs: [job] })[0]?.provenanceVerified).toBe(
      false
    );
    expect(
      parseDesktopJobs({
        jobs: [
          {
            ...job,
            steps: [
              { name: 'Verify signed beta provenance', conclusion: 'failure' },
            ],
          },
        ],
      })[0]?.provenanceVerified
    ).toBe(false);
    expect(
      parseDesktopJobs({
        jobs: [
          {
            ...job,
            steps: [
              { name: 'Verify signed beta provenance', conclusion: 'success' },
            ],
          },
        ],
      })[0]?.provenanceVerified
    ).toBe(true);
    expect(parseDesktopJobs(null)).toEqual([]);
  });
});
