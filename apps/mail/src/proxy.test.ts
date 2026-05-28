import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAIL_PROXY_MATCHER } from './proxy-matcher';

const proxyMatcherRegex = new RegExp(`^${MAIL_PROXY_MATCHER}$`);
const proxySource = fs.readFileSync(new URL('./proxy.ts', import.meta.url), {
  encoding: 'utf8',
});

describe('Mail proxy matcher', () => {
  it('keeps the Next proxy config matcher inline for static analysis', () => {
    expect(proxySource).toContain(
      "matcher: [\n    '/((?!_next/static|_next/image|favicon.ico"
    );
    expect(proxySource).not.toContain('matcher: [MAIL_PROXY_MATCHER]');
  });

  it('keeps generated public assets out of centralized auth redirects', () => {
    expect(proxyMatcherRegex.test('/manifest.webmanifest')).toBe(false);
    expect(proxyMatcherRegex.test('/sw.js')).toBe(false);
    expect(proxyMatcherRegex.test('/serwist/sw.js')).toBe(false);
    expect(proxyMatcherRegex.test('/transparent.png')).toBe(false);
  });

  it('still protects workspace pages', () => {
    expect(proxyMatcherRegex.test('/personal')).toBe(true);
    expect(proxyMatcherRegex.test('/personal?folder=sent')).toBe(true);
  });
});
