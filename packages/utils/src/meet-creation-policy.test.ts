import { describe, expect, it } from 'vitest';
import { canCreateOnlineMeeting } from './meet-creation-policy';

describe('online meeting creator domain', () => {
  it.each(['host@tuturuuu.com', 'Host@TUTURUUU.COM'])('allows %s', (email) => {
    expect(canCreateOnlineMeeting(email)).toBe(true);
  });
  it.each([
    null,
    undefined,
    '',
    '@tuturuuu.com',
    'host@gmail.com',
    'host@sub.tuturuuu.com',
    'host@tuturuuu.com.evil.test',
    'host@evil.test@tuturuuu.com',
    ' host@tuturuuu.com',
  ])('rejects %s', (email) => {
    expect(canCreateOnlineMeeting(email)).toBe(false);
  });
});

it.each(['PLUS', 'PRO', 'ENTERPRISE'])(
  'allows verified external %s eligibility',
  (tier) => {
    expect(canCreateOnlineMeeting('host@example.test', tier)).toBe(true);
    expect(canCreateOnlineMeeting('bad@@example.test', tier)).toBe(false);
  }
);
it('does not unlock hosting for an unknown tier', () => {
  expect(canCreateOnlineMeeting('host@example.test', 'UNKNOWN')).toBe(false);
});
