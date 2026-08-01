import { describe, expect, it } from 'vitest';
import { buildJoinUrl, decodeRoomCode, encodeRoomCode } from './room-code';

const MEETING = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';

describe('room codes', () => {
  it('round-trips a meeting id', () => {
    expect(decodeRoomCode(encodeRoomCode(MEETING))).toBe(MEETING);
  });

  it('round-trips ids with leading and trailing zero bytes', () => {
    for (const id of [
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '00000001-0000-0000-0000-000000000001',
    ]) {
      expect(decodeRoomCode(encodeRoomCode(id)), id).toBe(id);
    }
  });

  it('produces a grouped, lowercase, dash-separated code', () => {
    const code = encodeRoomCode(MEETING);

    expect(code).toBe(code.toLowerCase());
    expect(code.split('-').map((group) => group.length)).toEqual([9, 9, 8]);
  });

  it('never emits the characters Crockford omits', () => {
    const code = encodeRoomCode(MEETING).replace(/-/gu, '');
    for (const ambiguous of ['i', 'l', 'o', 'u']) {
      expect(code).not.toContain(ambiguous);
    }
  });

  it('accepts codes however a human retypes them', () => {
    const code = encodeRoomCode(MEETING);

    for (const variant of [
      code.toUpperCase(),
      code.replace(/-/gu, ''),
      `  ${code}  `,
      code.replace(/-/gu, ' '),
    ]) {
      expect(decodeRoomCode(variant), variant).toBe(MEETING);
    }
  });

  it('folds the ambiguous characters onto what the user meant', () => {
    const code = encodeRoomCode(MEETING).replace(/-/gu, '');
    // Any 1 in the code could have been typed as I or l.
    const withLetters = code.replace(/1/gu, 'I').replace(/0/gu, 'O');

    expect(decodeRoomCode(withLetters)).toBe(MEETING);
  });

  it('rejects codes of the wrong length or alphabet', () => {
    expect(decodeRoomCode('')).toBeNull();
    expect(decodeRoomCode('too-short')).toBeNull();
    expect(decodeRoomCode('!'.repeat(26))).toBeNull();
    expect(decodeRoomCode(`${encodeRoomCode(MEETING)}extra`)).toBeNull();
  });

  it('refuses to encode anything that is not a meeting UUID', () => {
    expect(() => encodeRoomCode('not-a-uuid')).toThrow();
  });

  it('builds a join URL without doubling the slash', () => {
    const code = encodeRoomCode(MEETING);

    expect(buildJoinUrl('https://meet.tuturuuu.com', MEETING)).toBe(
      `https://meet.tuturuuu.com/join/${code}`
    );
    expect(buildJoinUrl('https://meet.tuturuuu.com/', MEETING)).toBe(
      `https://meet.tuturuuu.com/join/${code}`
    );
  });

  it('gives different meetings different codes', () => {
    const other = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';

    expect(encodeRoomCode(MEETING)).not.toBe(encodeRoomCode(other));
    expect(decodeRoomCode(encodeRoomCode(other))).toBe(other);
  });
});
