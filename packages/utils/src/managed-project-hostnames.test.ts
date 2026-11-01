import { describe, expect, it } from 'vitest';
import {
  isReservedManagedProjectHostname,
  isSafeManagedProjectHostname,
  normalizeManagedProjectHostname,
} from './managed-project-hostnames';

// Former staging and cutover hosts that sat inside the production cookie zone.
const FORMER_STAGING_HOSTS = [
  'ai-staging.tuturuuu.com',
  'calendar-cutover.tuturuuu.com',
  'calendar-staging.tuturuuu.com',
  'cms-staging.tuturuuu.com',
  'finance-staging.tuturuuu.com',
  'forms-staging.tuturuuu.com',
  'inventory-staging.tuturuuu.com',
  'nova-staging.tuturuuu.com',
  'one-origin-staging.tuturuuu.com',
  'staging.tuturuuu.com',
  'storefront-staging.tuturuuu.com',
  'tasks-staging.tuturuuu.com',
  'track-staging.tuturuuu.com',
];

describe('managed project hostname reservation', () => {
  it.each(FORMER_STAGING_HOSTS)('reserves former staging host %s', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(true);
  });

  it.each([
    'tuturuuu.com',
    'forms.tuturuuu.com',
    'ai.tuturuuu.com',
    'store.tuturuuu.com',
    'docs.tuturuuu.com',
    'meet.tuturuuu.com',
    'dev.tuturuuu.com',
    'a.b.tuturuuu.com',
    'tutur3u.com',
    'app.tutur3u.com',
    'web.staging.tutur3u.com',
    'staging.tutur3u.com',
    'localhost',
    'nova.ai.vn',
    'rewise.me',
  ])('reserves platform hostname %s', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(true);
  });

  it.each([
    'Forms.Tuturuuu.COM',
    'forms.tuturuuu.com.',
    ' HTTPS://Meet.Tuturuuu.com./room ',
    'TUTURUUU.COM..',
    'TUTUR3U.COM',
    'tutur3u.com.',
    'App.Tutur3u.COM.',
    'HTTPS://Web.Tutur3u.com./x',
  ])('normalizes case, scheme, path and trailing dots for %s', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(true);
  });

  it.each([
    'docs.example.com',
    'tuturuuu.com.example.org',
    'nottuturuuu.com',
    'tuturuuu.co',
    'tutur3u.com.evil.example',
    'xtutur3u.com',
    'tutur3u.co',
    'tutur3u.com-evil.example',
    'app.tutur3u.com.evil.example',
  ])('still allows customer hostname %s', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(false);
  });

  it.each([
    'a.b.tutur3u.com',
    'one.two.three.tutur3u.com',
    'xn--e1afmkfd.tutur3u.com',
    'xn--tutur3u-9ya.tutur3u.com',
  ])('reserves nested or punycode subdomain %s of the staging apex', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(true);
  });

  it.each([
    'tutur\u0430u.com',
    '\uff54\uff55\uff54\uff55\uff52\u0033\uff55.com',
    'app.tutur3u\uff0ecom',
  ])('fails closed for non-ASCII lookalike %j', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(true);
  });

  it('normalizes to a bare lowercase hostname', () => {
    expect(
      normalizeManagedProjectHostname(' HTTPS://Docs.Example.COM./a ')
    ).toBe('docs.example.com');
  });

  it('rejects a 100k-dot hostname quickly instead of backtracking', () => {
    for (const input of [
      `${'.'.repeat(100_000)}x`,
      `docs.example.com${'.'.repeat(100_000)}`,
      ` ${'a.'.repeat(50_000)}com `,
    ]) {
      const started = performance.now();
      expect(isSafeManagedProjectHostname(input)).toBe(false);
      expect(isReservedManagedProjectHostname(input)).toBe(true);
      expect(performance.now() - started).toBeLessThan(100);
    }
  });

  it('enforces the 253-character name and 63-character label limits', () => {
    const label63 = 'a'.repeat(63);
    expect(isSafeManagedProjectHostname(`${label63}.example.com`)).toBe(true);
    expect(isSafeManagedProjectHostname(`${label63}a.example.com`)).toBe(false);
    const name253 = `${'a'.repeat(61)}.`.repeat(4).concat('com');
    expect(name253).toHaveLength(251);
    expect(isSafeManagedProjectHostname(name253)).toBe(true);
    expect(isSafeManagedProjectHostname(`aaa.${name253}`)).toBe(false);
  });

  it.each([
    'forms.tuturuuu.com:443',
    'forms\uff0etuturuuu\uff0ecom',
    'forms.\uff54\uff55\uff54\uff55\uff52\uff55\uff55\uff55.com',
    '//forms.tuturuuu.com',
    'forms.tuturuuu.com?x',
    'user@forms.tuturuuu.com',
    '',
  ])('fails closed for unsafe input %j', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(true);
  });
});
