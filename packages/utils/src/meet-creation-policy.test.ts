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
