import { describe, expect, it, vi } from 'vitest';
import { parseMeetingCode } from './meeting-code-input';
import { encodeRoomCode } from './room-code';

vi.mock('@/i18n/routing', () => ({ supportedLocales: ['en', 'vi'] }));

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
    `/plans/r/${code}`,
    `/foo/bar/r/${code}`,
    `/fr/r/${code}`,
    'invalid',
  ])('rejects %s', (input) => {
    expect(parseMeetingCode(input, origin)).toBeNull();
  });
});
