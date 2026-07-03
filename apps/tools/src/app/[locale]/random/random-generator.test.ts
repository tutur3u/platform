import { describe, expect, it } from 'vitest';
import {
  generateRandomStringFromAlphabet,
  generateRandomValues,
  type RandomCryptoSource,
} from './random-generator';

function createCryptoSource(
  bytes: number[],
  randomUUID?: () => string
): RandomCryptoSource {
  let byteIndex = 0;

  return {
    getRandomValues<T extends Uint8Array>(array: T) {
      for (let index = 0; index < array.length; index++) {
        array[index] = bytes[byteIndex % bytes.length] ?? 0;
        byteIndex += 1;
      }

      return array;
    },
    randomUUID,
  };
}

describe('secure random generator', () => {
  it('uses crypto.randomUUID for UUID values when available', () => {
    const values = generateRandomValues(
      { batchCount: 1, mode: 'uuid' },
      createCryptoSource([0], () => '11111111-2222-4333-8444-555555555555')
    );

    expect(values).toEqual([
      {
        entropyBits: 122,
        id: 'uuid-0',
        kind: 'uuid',
        value: '11111111-2222-4333-8444-555555555555',
      },
    ]);
  });

  it('creates RFC 4122 UUID v4 values from random bytes as a fallback', () => {
    const values = generateRandomValues(
      { batchCount: 1, mode: 'uuid' },
      createCryptoSource([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    );

    expect(values[0]?.value).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('generates NanoID-style URL-safe ids with the requested length', () => {
    const values = generateRandomValues(
      { batchCount: 1, length: 4, mode: 'id' },
      createCryptoSource([0, 1, 62, 63])
    );

    expect(values[0]?.value).toBe('AB_-');
    expect(values[0]?.entropyBits).toBe(24);
  });

  it('rejects biased random bytes when selecting alphabet characters', () => {
    const value = generateRandomStringFromAlphabet(
      3,
      '0123456789',
      createCryptoSource([255, 250, 9, 0, 1])
    );

    expect(value).toBe('901');
  });

  it('generates hex tokens from random bytes', () => {
    const values = generateRandomValues(
      { batchCount: 1, byteLength: 4, encoding: 'hex', mode: 'token' },
      createCryptoSource([0, 15, 16, 255])
    );

    expect(values[0]?.value).toBe('000f10ff');
    expect(values[0]?.entropyBits).toBe(32);
  });

  it('generates unpadded base64url tokens from random bytes', () => {
    const values = generateRandomValues(
      {
        batchCount: 1,
        byteLength: 4,
        encoding: 'base64url',
        mode: 'token',
        prefix: 'ttr_',
      },
      createCryptoSource([255, 255, 255, 1])
    );

    expect(values[0]?.value).toBe('ttr_____AQ');
    expect(values[0]?.entropyBits).toBe(32);
  });

  it('generates passwords with every selected character class', () => {
    const values = generateRandomValues(
      {
        batchCount: 1,
        excludeAmbiguous: false,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: true,
        includeUppercase: true,
        length: 16,
        mode: 'password',
      },
      createCryptoSource(Array.from({ length: 64 }, (_, index) => index))
    );

    const password = values[0]?.value ?? '';

    expect(password).toHaveLength(16);
    expect(password).toMatch(/[A-Z]/u);
    expect(password).toMatch(/[a-z]/u);
    expect(password).toMatch(/[0-9]/u);
    expect(password).toMatch(/[!@#$%^&*()\-_=+[\]{};:,.?/]/u);
  });

  it('excludes ambiguous password characters when requested', () => {
    const values = generateRandomValues(
      {
        batchCount: 1,
        excludeAmbiguous: true,
        includeLowercase: true,
        includeNumbers: true,
        includeSymbols: false,
        includeUppercase: true,
        length: 24,
        mode: 'password',
      },
      createCryptoSource(Array.from({ length: 128 }, (_, index) => index))
    );

    expect(values[0]?.value).not.toMatch(/[0Oo1Il|`'"]/u);
  });

  it('rejects password generation with no selected character classes', () => {
    expect(() =>
      generateRandomValues(
        {
          batchCount: 1,
          excludeAmbiguous: false,
          includeLowercase: false,
          includeNumbers: false,
          includeSymbols: false,
          includeUppercase: false,
          length: 16,
          mode: 'password',
        },
        createCryptoSource([0])
      )
    ).toThrow('Select at least one password character set.');
  });

  it('rejects passwords shorter than the required class coverage', () => {
    expect(() =>
      generateRandomValues(
        {
          batchCount: 1,
          excludeAmbiguous: false,
          includeLowercase: true,
          includeNumbers: true,
          includeSymbols: true,
          includeUppercase: true,
          length: 3,
          mode: 'password',
        },
        createCryptoSource([0])
      )
    ).toThrow('Password length must fit every selected character set.');
  });
});
