import { describe, expect, it } from 'vitest';
import { MAIL_PROXY_MATCHER } from './proxy-matcher';

const proxyMatcherRegex = new RegExp(`^${MAIL_PROXY_MATCHER}$`);

describe('Mail proxy matcher', () => {
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
