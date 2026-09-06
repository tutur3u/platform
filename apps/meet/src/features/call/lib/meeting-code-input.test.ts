import { describe, expect, it } from 'vitest';
import { parseMeetingCode } from './meeting-code-input';
import { encodeRoomCode } from './room-code';

const id = '11111111-1111-4111-8111-111111111111';
const code = encodeRoomCode(id);
const origin = 'https://meet.tuturuuu.com';
describe('meeting code input', () => {
  it.each([code, `/r/${code}`, `/en/r/${code}`, `${origin}/r/${code}`, id])(
    'accepts %s',
    (input) => {
      expect(parseMeetingCode(input, origin)).toBe(id);
    }
  );
  it.each([
    `https://other.test/r/${code}`,
    `javascript:/r/${code}`,
    '/plans',
    'invalid',
  ])('rejects %s', (input) => {
    expect(parseMeetingCode(input, origin)).toBeNull();
  });
});
