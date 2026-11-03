import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createEraseSubjectTag, encodeEraseSubject } from './erase-subject-tag';

const subject = {
  wsId: '11111111-1111-4111-8111-111111111111',
  meetingId: '22222222-2222-4222-8222-222222222222',
  subjectId: '33333333-3333-4333-8333-333333333333',
};
// Public, deterministic TEST keys. Never use these fixtures outside tests.
const testKey = {
  version: 1,
  bytes: Uint8Array.from({ length: 32 }, (_, i) => i),
};
const encodedHex =
  '6d6565742d65726173652d7375626a6563742f76310001111111111111411181111111111111112222222222224222822222222222222233333333333343338333333333333333';

describe('erase subject tag v1', () => {
  it('pins the 71-byte domain, separator, version and ordered UUID bytes', () => {
    const encoded = encodeEraseSubject(subject);
    expect(encoded).toHaveLength(71);
    expect(Buffer.from(encoded).toString('hex')).toBe(encodedHex);
  });
  it.each([
    [
      testKey,
      'fc1a5b7a76b1864e6618c58a481169f572cfd8915b488027e551a420327804c2',
    ],
    [
      { version: 2, bytes: new Uint8Array(32).fill(0x42) },
      'c0ea43af6d17341510097dc309d14bd3827dd4a4b78514ef2e0855f2392e68d9',
    ],
  ])(
    'matches independently computed Python known-answer vectors',
    async (key, expected) => {
      expect(await createEraseSubjectTag({ ...subject, key })).toEqual({
        subjectTag: expected,
        subjectKeyVersion: key.version,
      });
    }
  );
  it('separates the subject domain from other HMAC purposes', async () => {
    const other = Buffer.concat([
      Buffer.from('meet-erase-ledger/v1\0\x01'),
      Buffer.from(encodedHex, 'hex').subarray(23),
    ]);
    const otherTag = createHmac('sha256', testKey.bytes)
      .update(other)
      .digest('hex');
    expect(
      (await createEraseSubjectTag({ ...subject, key: testKey })).subjectTag
    ).not.toBe(otherTag);
  });
  it.each(['wsId', 'meetingId', 'subjectId'] as const)(
    'scopes tags to %s',
    async (field) => {
      const original = await createEraseSubjectTag({
        ...subject,
        key: testKey,
      });
      const changed = await createEraseSubjectTag({
        ...subject,
        [field]: '44444444-4444-4444-8444-444444444444',
        key: testKey,
      });
      expect(changed.subjectTag).not.toBe(original.subjectTag);
      expect(Object.keys(original).sort()).toEqual([
        'subjectKeyVersion',
        'subjectTag',
      ]);
    }
  );
  it.each(['wsId', 'meetingId', 'subjectId'] as const)(
    'rejects malformed or noncanonical %s',
    (field) => {
      for (const value of [
        '',
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        'person@example.test',
        '33333333333343338333333333333333',
        '33333333-3333-4333-7333-333333333333',
        'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
        `${subject.subjectId} `,
        `${subject.subjectId}\n`,
      ]) {
        expect(() =>
          encodeEraseSubject({ ...subject, [field]: value })
        ).toThrow('MEET_ERASE_INVALID_UUID');
      }
    }
  );
  it.each([null, undefined, { version: 1, bytes: new Uint8Array() }])(
    'refuses unavailable keys with a stable content-free error',
    async (key) => {
      await expect(createEraseSubjectTag({ ...subject, key })).rejects.toThrow(
        'MEET_ERASE_LOG_KEY_UNAVAILABLE'
      );
    }
  );
  it.each([1, 16, 31])('refuses a %s-byte test key', async (length) => {
    await expect(
      createEraseSubjectTag({
        ...subject,
        key: { version: 1, bytes: new Uint8Array(length) },
      })
    ).rejects.toThrow('MEET_ERASE_LOG_KEY_UNAVAILABLE');
  });
  it('accepts a test key longer than 32 bytes', async () => {
    const key = { version: 1, bytes: new Uint8Array(33).fill(0x42) };
    expect((await createEraseSubjectTag({ ...subject, key })).subjectTag).toBe(
      createHmac('sha256', key.bytes)
        .update(encodeEraseSubject(subject))
        .digest('hex')
    );
  });
  it.each([0, -1, 1.5, NaN])(
    'rejects invalid key version %s',
    async (version) => {
      await expect(
        createEraseSubjectTag({ ...subject, key: { ...testKey, version } })
      ).rejects.toThrow('MEET_ERASE_LOG_KEY_UNAVAILABLE');
    }
  );
});
