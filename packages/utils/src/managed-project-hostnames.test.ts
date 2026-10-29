import { describe, expect, it } from 'vitest';
import {
  isReservedManagedProjectHostname,
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
  ])('normalizes case, scheme, path and trailing dots for %s', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(true);
  });

  it.each([
    'docs.example.com',
    'tuturuuu.com.example.org',
    'nottuturuuu.com',
    'tuturuuu.co',
    'tutur3u.com',
    'app.tutur3u.com',
  ])('still allows customer hostname %s', (host) => {
    expect(isReservedManagedProjectHostname(host)).toBe(false);
  });

  it('normalizes to a bare lowercase hostname', () => {
    expect(
      normalizeManagedProjectHostname(' HTTPS://Docs.Example.COM./a ')
    ).toBe('docs.example.com');
  });
});
