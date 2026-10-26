import * as nodeCrypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hashPassword,
  isPasswordKdfHash,
  MAX_PASSWORD_LENGTH,
  PASSWORD_KDF_PARAMS,
  parsePasswordKdfHash,
  passwordHashNeedsRehash,
  verifyPassword,
} from '../crypto';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const LEGACY_HASH =
  '7a37b85c8918eac19a9089c0fa5a2ab4dce3f90528dcdeec108b23ddf3607b99';

const SALT_B64 = Buffer.alloc(16, 7).toString('base64url');
const KEY_B64 = Buffer.alloc(32, 9).toString('base64url');

function encoded(parts: Array<string | number>) {
  return parts.join('$');
}

describe('password KDF', () => {
  afterEach(() => {
    vi.mocked(nodeCrypto.timingSafeEqual).mockClear();
  });

  describe('hashPassword', () => {
    it('produces a self-describing scrypt encoding with current parameters', async () => {
      const hash = await hashPassword('correct horse battery staple');
      const [id, N, r, p, salt, key] = hash.split('$');

      expect(id).toBe('scrypt');
      expect(Number(N)).toBe(PASSWORD_KDF_PARAMS.N);
      expect(Number(N)).toBeGreaterThanOrEqual(2 ** 15);
      expect(Number(r)).toBe(8);
      expect(Number(p)).toBe(1);
      expect(Buffer.from(salt!, 'base64url')).toHaveLength(16);
      expect(Buffer.from(key!, 'base64url')).toHaveLength(32);
      expect(isPasswordKdfHash(hash)).toBe(true);
      expect(passwordHashNeedsRehash(hash)).toBe(false);
    });

    it('uses a fresh random salt for every hash', async () => {
      const [a, b] = await Promise.all([
        hashPassword('same'),
        hashPassword('same'),
      ]);
      expect(a).not.toBe(b);
    });

    it('rejects oversized and non-string input', async () => {
      await expect(
        hashPassword('x'.repeat(MAX_PASSWORD_LENGTH + 1))
      ).rejects.toThrow(RangeError);
      await expect(hashPassword(42 as unknown as string)).rejects.toThrow(
        TypeError
      );
    });
  });

  describe('verifyPassword', () => {
    it('verifies the correct password and rejects others', async () => {
      const hash = await hashPassword('p@$$w0rd 密码テスト');

      await expect(
        verifyPassword('p@$$w0rd 密码テスト', { hash })
      ).resolves.toEqual({
        valid: true,
        needsRehash: false,
        scheme: 'scrypt',
        resetRequired: false,
      });
      await expect(verifyPassword('p@$$w0rd', { hash })).resolves.toEqual({
        valid: false,
        needsRehash: false,
        scheme: 'scrypt',
        resetRequired: false,
      });
    });

    it('supports the empty password used by passwordless Meet guests', async () => {
      const hash = await hashPassword('');
      expect((await verifyPassword('', { hash })).valid).toBe(true);
      expect((await verifyPassword(' ', { hash })).valid).toBe(false);
    });

    it('compares derived keys with timingSafeEqual', async () => {
      const hash = await hashPassword('secret');
      vi.mocked(nodeCrypto.timingSafeEqual).mockClear();

      await verifyPassword('wrong', { hash });

      expect(nodeCrypto.timingSafeEqual).toHaveBeenCalledTimes(1);
    });

    it('requires reset for legacy rows regardless of the provided password or salt', async () => {
      for (const password of ['password', 'wrong', LEGACY_HASH]) {
        for (const salt of ['salt', null, undefined, '']) {
          expect(
            await verifyPassword(password, { hash: LEGACY_HASH, salt })
          ).toEqual({
            valid: false,
            needsRehash: false,
            scheme: 'legacy-sha256',
            resetRequired: true,
          });
        }
      }
    });

    it('never accepts a stored hash as the password', async () => {
      const hash = await hashPassword('secret');
      const legacy = LEGACY_HASH;

      expect((await verifyPassword(hash, { hash })).valid).toBe(false);
      expect(
        (await verifyPassword(legacy, { hash: legacy, salt: 'salt' })).valid
      ).toBe(false);
    });

    it('asks for a rehash when stored parameters differ from current ones', async () => {
      const salt = Buffer.alloc(16, 1);
      const key = nodeCrypto.scryptSync('secret', salt, 32, {
        N: 2 ** 14,
        r: 8,
        p: 1,
      });
      const weaker = encoded([
        'scrypt',
        2 ** 14,
        8,
        1,
        salt.toString('base64url'),
        key.toString('base64url'),
      ]);

      expect(passwordHashNeedsRehash(weaker)).toBe(true);
      await expect(verifyPassword('secret', { hash: weaker })).resolves.toEqual(
        {
          valid: true,
          needsRehash: true,
          scheme: 'scrypt',
          resetRequired: false,
        }
      );
    });

    it.each([
      ['empty', ''],
      ['null', null],
      ['unknown scheme', 'bcrypt$2b$10$abc'],
      ['wrong part count', encoded(['scrypt', 32768, 8, 1, SALT_B64])],
      [
        'non power of two N',
        encoded(['scrypt', 30000, 8, 1, SALT_B64, KEY_B64]),
      ],
      ['N below bound', encoded(['scrypt', 2 ** 10, 8, 1, SALT_B64, KEY_B64])],
      ['N above bound', encoded(['scrypt', 2 ** 24, 8, 1, SALT_B64, KEY_B64])],
      ['r too large', encoded(['scrypt', 32768, 64, 1, SALT_B64, KEY_B64])],
      ['p too large', encoded(['scrypt', 32768, 8, 99, SALT_B64, KEY_B64])],
      ['zero r', encoded(['scrypt', 32768, 0, 1, SALT_B64, KEY_B64])],
      ['leading zero', encoded(['scrypt', '032768', 8, 1, SALT_B64, KEY_B64])],
      ['short salt', encoded(['scrypt', 32768, 8, 1, 'AAAA', KEY_B64])],
      ['bad base64', encoded(['scrypt', 32768, 8, 1, 'not*base64', KEY_B64])],
      ['short key', encoded(['scrypt', 32768, 8, 1, SALT_B64, 'AAAA'])],
      ['legacy uppercase hex', 'A'.repeat(64)],
      ['legacy wrong length', 'a'.repeat(63)],
    ])('rejects malformed stored hash: %s', async (_label, hash) => {
      expect(parsePasswordKdfHash(hash)).toBeNull();
      await expect(
        verifyPassword('secret', { hash, salt: 'salt' })
      ).resolves.toMatchObject({
        valid: false,
        needsRehash: false,
        resetRequired: typeof hash === 'string' && hash.length > 0,
      });
    });

    it('rejects oversized or non-string presented passwords without throwing', async () => {
      const hash = await hashPassword('secret');
      await expect(
        verifyPassword('x'.repeat(MAX_PASSWORD_LENGTH + 1), { hash })
      ).resolves.toMatchObject({ valid: false });
      await expect(
        verifyPassword(undefined as unknown as string, { hash })
      ).resolves.toMatchObject({ valid: false });
    });
  });
});
