import { describe, expect, it } from 'vitest';
import { hasQaTestMarker, isActiveQaStaffHost } from '../qa-test-account';

const now = Date.parse('2026-11-20T12:00:00Z');
const host = {
  email_confirmed_at: '2026-11-20T00:00:00Z',
  app_metadata: {
    qa_test: true,
    qa_staff: true,
    qa_expires_at: '2026-11-21T00:00:00Z',
  },
};

describe('QA test account markers', () => {
  it('recognizes only the boolean service marker', () => {
    expect(hasQaTestMarker(host)).toBe(true);
    expect(hasQaTestMarker({ app_metadata: { qa_test: 'true' } })).toBe(false);
    expect(hasQaTestMarker({ app_metadata: {} })).toBe(false);
    expect(hasQaTestMarker(null)).toBe(false);
  });

  it.each([
    ['active staff host', host, true],
    [
      'expired run',
      {
        ...host,
        app_metadata: {
          ...host.app_metadata,
          qa_expires_at: '2026-11-20T11:59:59Z',
        },
      },
      false,
    ],
    [
      'participant',
      { ...host, app_metadata: { ...host.app_metadata, qa_staff: false } },
      false,
    ],
    ['unconfirmed', { ...host, email_confirmed_at: null }, false],
    [
      'banned for deletion',
      { ...host, banned_until: '2126-01-01T00:00:00Z' },
      false,
    ],
    ['ban lapsed', { ...host, banned_until: '2026-11-20T00:00:00Z' }, true],
    [
      'unparseable expiry',
      {
        ...host,
        app_metadata: { ...host.app_metadata, qa_expires_at: 'never' },
      },
      false,
    ],
    [
      'no marker',
      {
        ...host,
        app_metadata: { qa_staff: true, qa_expires_at: '2099-01-01' },
      },
      false,
    ],
  ])('admits Meet hosting for %s: %s', (_label, user, expected) => {
    expect(isActiveQaStaffHost(user, now)).toBe(expected);
  });
});
