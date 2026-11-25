import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Read the matcher from source so this guard does not load the proxy's
// runtime dependencies. Next statically analyses the inline literal.
const proxySource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../proxy.ts'),
  'utf8'
);
const configSource = proxySource.slice(
  proxySource.indexOf('export const config')
);
const matcherLiteral = configSource.match(/'(\/\(\(\?!.*)'/)?.[1];
const matcher = new RegExp(`^${matcherLiteral?.replaceAll('\\\\', '\\')}$`);

describe('web proxy matcher', () => {
  it('keeps the matcher inline for Next static analysis', () => {
    expect(matcherLiteral).toBeDefined();
  });

  it('skips real static assets', () => {
    for (const path of [
      '/_next/static/chunks/app.js',
      '/_next/image',
      '/favicon.ico',
      '/robots.txt',
      '/manifest.webmanifest',
      '/sw.js',
      '/sw.js.map',
      '/serwist/sw.js',
      '/monitoring',
      '/.well-known/assetlinks.json',
      '/cover.png',
      '/logo.svg',
      '/media/background/wallpaper.jpg',
      '/media/sounds/notify.mp3',
      '/screenshots/dashboard/tasks.png',
    ]) {
      expect(matcher.test(path), path).toBe(false);
    }
  });

  it('never lets an asset-like suffix skip protected or API paths', () => {
    for (const path of [
      '/vi/personal/tasks/stage-smoke-probe.png',
      '/personal/tasks/probe.webp',
      '/en/internal/settings/report.pdf',
      '/api/v1/storage/download/ws/file.png',
      '/vi/partners/opengraph-image.png',
      '/vi/personal/tasks',
      '/_nextfoo',
      '/monitoring-ws/tasks',
      '/serwist-ws/tasks',
    ]) {
      expect(matcher.test(path), path).toBe(true);
    }
  });
});
