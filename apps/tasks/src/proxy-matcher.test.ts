import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Read the matcher from source so this guard does not load the proxy's
// runtime dependencies. Next statically analyses the inline literal.
const proxySource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'proxy.ts'),
  'utf8'
);
const configSource = proxySource.slice(
  proxySource.indexOf('export const config')
);
const matcherLiteral = configSource.match(/'(\/\(\(\?!.*)'/)?.[1];
const matcher = new RegExp(`^${matcherLiteral?.replaceAll('\\\\', '\\')}$`);

describe('tasks proxy matcher', () => {
  it('keeps the matcher inline for Next static analysis', () => {
    expect(matcherLiteral).toBeDefined();
  });

  it('skips real static assets', () => {
    for (const pathname of [
      '/_next/static/chunks/app.js',
      '/_next/image',
      '/favicon.ico',
      '/robots.txt',
      '/offline.html',
      '/serwist/sw.js',
      '/serwist/sw.js.map',
      '/monitoring',
      '/apple-touch-icon.png',
      '/media/logos/tuturuuu.png',
    ]) {
      expect(matcher.test(pathname), pathname).toBe(false);
    }
  });

  it('never lets an asset-like suffix skip protected or API paths', () => {
    for (const pathname of [
      '/personal/tasks/stage-smoke-probe.png',
      '/vi/personal/tasks/stage-smoke-probe.png',
      '/en/internal/boards/board.svg',
      '/personal/report.pdf',
      '/api/v1/workspaces/personal/file.png',
      '/_nextfoo',
      '/monitoring-workspace/tasks',
    ]) {
      expect(matcher.test(pathname), pathname).toBe(true);
    }
  });
});
