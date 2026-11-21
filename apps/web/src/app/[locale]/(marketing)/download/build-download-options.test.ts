import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_PACKAGES, parseDesktopRelease } from '@/lib/desktop-downloads';
import en from '../../../../../messages/en.json';

vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    getTranslations: () =>
      createTranslator({
        locale: 'en',
        messages: { desktop_download: en.desktop_download },
        namespace: 'desktop_download',
      }),
  };
});

import { buildDownloadContent } from './build-download-options';

const mobile = {
  ios: { store: null, betaUrl: null },
  android: { store: null, betaUrl: null },
};
const status = { ios: null, android: null, desktop: null };

describe('desktop beta platform cards', () => {
  it('shows the exact published package and no CTA for a missing platform', async () => {
    const tag = 'desktop-v0.27.28-1000001';
    const base = 'https://github.com/tutur3u/platform/releases';
    const { name } = DESKTOP_PACKAGES.windows;
    const url = `${base}/download/${tag}/${name}`;
    const sha256 = 'a'.repeat(64);
    const release = parseDesktopRelease({
      tag_name: tag,
      draft: false,
      prerelease: true,
      html_url: `${base}/tag/${tag}`,
      body: '- Windows packages are UNSIGNED for now. SmartScreen may warn.',
      assets: [
        {
          name,
          state: 'uploaded',
          size: 1024 * 1024,
          digest: `sha256:${sha256}`,
          browser_download_url: url,
        },
      ],
    });

    const { labels, options } = await buildDownloadContent(
      release,
      mobile,
      status
    );

    expect(options.windows).toMatchObject({
      beta: true,
      architecture: 'x64',
      action: {
        href: url,
        label: 'Download beta for Windows',
        shortLabel: 'Download beta',
      },
      requirements: 'Windows 10 or later · Intel / AMD 64-bit',
      meta: ['Version 0.27.28 (build 1000001)', '1 MB'],
      sha256,
    });
    expect(options.windows.note).toContain('SmartScreen may warn you.');
    for (const platform of ['macos', 'linux'] as const) {
      expect(options[platform]).toMatchObject({
        beta: false,
        action: null,
        meta: [],
      });
      expect(options[platform].note).toBeUndefined();
      expect(options[platform].sha256).toBeUndefined();
    }
    expect(labels.unavailable).toBe('Coming soon');
    expect(options.web.action?.href).toBe('/login');
  });
});
