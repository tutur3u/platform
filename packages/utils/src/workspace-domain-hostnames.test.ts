import { describe, expect, it } from 'vitest';
import {
  classifyWorkspaceDomainHostname,
  normalizeRequestHost,
} from './workspace-domain-hostnames';

describe('classifyWorkspaceDomainHostname', () => {
  it.each([
    ['vohoangphuc.com', 'custom'],
    ['https://Blog.Example.org/path', 'custom'],
    ['www.example.co.uk.', 'custom'],
    ['phuc.ttr.gg', 'platform_subdomain'],
    ['my-site.ttr.gg', 'platform_subdomain'],
  ])('accepts %s as %s', (input, kind) => {
    const result = classifyWorkspaceDomainHostname(input, {
      platformApex: 'ttr.gg',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe(kind);
  });

  it.each([
    'tuturuuu.com',
    'www.tuturuuu.com',
    'evil.tuturuuu.com',
    'tutur3u.com',
    'calendar.tutur3u.com',
    'ttr.gg',
    'www.ttr.gg',
    'saas.ttr.gg',
    'fysh.ttr.gg',
    'vhp.ttr.gg',
    'VHP.ttr.gg.',
    'api.ttr.gg',
    'a.b.ttr.gg',
    'ab.ttr.gg',
    'x--y.ttr.gg',
    'tuturuu.com',
    'nova.ai.vn',
  ])('reserves %s', (input) => {
    expect(
      classifyWorkspaceDomainHostname(input, { platformApex: 'ttr.gg' })
    ).toMatchObject({
      ok: false,
      reason: 'reserved',
    });
  });

  it.each([
    '',
    'not a host',
    'example',
    'localhost',
    '*.example.com',
    'example.com:8080',
  ])('rejects invalid %s', (input) => {
    expect(classifyWorkspaceDomainHostname(input).ok).toBe(false);
  });
});

describe('platform apex configuration', () => {
  it('disables platform subdomains when no apex is configured', () => {
    for (const host of ['phuc.ttr.gg', 'ttr.gg', 'vhp.ttr.gg']) {
      expect(classifyWorkspaceDomainHostname(host)).toMatchObject({
        ok: false,
        reason: 'reserved',
      });
    }
    expect(
      classifyWorkspaceDomainHostname('phuc.ttr.gg', { platformApex: '' })
    ).toMatchObject({ ok: false, reason: 'reserved' });
  });

  it('serves another apex while keeping the ttr.gg hosts reserved', () => {
    const policy = { platformApex: 'Sites.Example.NET.' };
    expect(
      classifyWorkspaceDomainHostname('phuc.sites.example.net', policy)
    ).toMatchObject({ ok: true, kind: 'platform_subdomain' });
    for (const host of [
      'sites.example.net',
      'www.sites.example.net',
      'saas.sites.example.net',
      'vhp.sites.example.net',
      'phuc.ttr.gg',
      'www.ttr.gg',
      'ttr.gg',
    ]) {
      expect(classifyWorkspaceDomainHostname(host, policy)).toMatchObject({
        ok: false,
        reason: 'reserved',
      });
    }
  });
});

describe('normalizeRequestHost', () => {
  it('drops ports, case and trailing dots', () => {
    expect(normalizeRequestHost('Example.COM:443')).toBe('example.com');
    expect(normalizeRequestHost('example.com.')).toBe('example.com');
  });

  it('rejects IPv6 literals, empty and unsafe hosts', () => {
    expect(normalizeRequestHost('[::1]:8787')).toBeNull();
    expect(normalizeRequestHost('')).toBeNull();
    expect(normalizeRequestHost(null)).toBeNull();
    expect(normalizeRequestHost('bad_host.com')).toBeNull();
  });
});
