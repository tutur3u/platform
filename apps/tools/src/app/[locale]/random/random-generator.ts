export type RandomGeneratorMode = 'uuid' | 'id' | 'token' | 'password';

export type TokenEncoding = 'base64url' | 'hex';

export interface UuidGeneratorOptions {
  batchCount: number;
  mode: 'uuid';
}

export interface IdGeneratorOptions {
  batchCount: number;
  length: number;
  mode: 'id';
}

export interface TokenGeneratorOptions {
  batchCount: number;
  byteLength: number;
  encoding: TokenEncoding;
  mode: 'token';
  prefix?: string;
}

export interface PasswordGeneratorOptions {
  batchCount: number;
  excludeAmbiguous: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  includeUppercase: boolean;
  length: number;
  mode: 'password';
}

export type RandomGeneratorOptions =
  | UuidGeneratorOptions
  | IdGeneratorOptions
  | TokenGeneratorOptions
  | PasswordGeneratorOptions;

export interface GeneratedRandomValue {
  entropyBits: number;
  id: string;
  kind: RandomGeneratorMode;
  value: string;
}

export interface RandomCryptoSource {
  getRandomValues<T extends Uint8Array>(array: T): T;
  randomUUID?: () => string;
}

export const URL_SAFE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export const PASSWORD_CLASSES = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
} as const;

const AMBIGUOUS_CHARACTERS = new Set([
  '0',
  'O',
  'o',
  '1',
  'I',
  'l',
  '|',
  '`',
  "'",
  '"',
]);

const HEX_ALPHABET = '0123456789abcdef';
const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const MAX_BATCH_COUNT = 50;
const MAX_STRING_LENGTH = 256;
const MAX_TOKEN_BYTES = 256;

export function generateRandomValues(
  options: RandomGeneratorOptions,
  cryptoSource: RandomCryptoSource = getBrowserCrypto()
): GeneratedRandomValue[] {
  validateBatchCount(options.batchCount);

  return Array.from({ length: options.batchCount }, (_, index) => ({
    entropyBits: estimateEntropyBits(options),
    id: `${options.mode}-${index}`,
    kind: options.mode,
    value: generateRandomValue(options, cryptoSource),
  }));
}

export function generateRandomStringFromAlphabet(
  length: number,
  alphabet: string,
  cryptoSource: RandomCryptoSource
) {
  validateLength(length, 'length');

  if (alphabet.length < 2 || alphabet.length > 256) {
    throw new Error('Alphabet must contain between 2 and 256 characters.');
  }

  const maxMultiple = Math.floor(256 / alphabet.length) * alphabet.length;
  let value = '';

  while (value.length < length) {
    const bytes = new Uint8Array(Math.max(16, (length - value.length) * 2));
    cryptoSource.getRandomValues(bytes);

    for (const byte of bytes) {
      if (byte >= maxMultiple) continue;
      value += alphabet[byte % alphabet.length];
      if (value.length === length) break;
    }
  }

  return value;
}

function generateRandomValue(
  options: RandomGeneratorOptions,
  cryptoSource: RandomCryptoSource
) {
  switch (options.mode) {
    case 'uuid':
      return generateUuid(cryptoSource);
    case 'id':
      validateLength(options.length, 'length');
      return generateRandomStringFromAlphabet(
        options.length,
        URL_SAFE_ALPHABET,
        cryptoSource
      );
    case 'token':
      validateTokenOptions(options);
      return `${options.prefix ?? ''}${generateToken(options, cryptoSource)}`;
    case 'password':
      return generatePassword(options, cryptoSource);
  }
}

function generateUuid(cryptoSource: RandomCryptoSource) {
  if (typeof cryptoSource.randomUUID === 'function') {
    return cryptoSource.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function generateToken(
  options: TokenGeneratorOptions,
  cryptoSource: RandomCryptoSource
) {
  const bytes = new Uint8Array(options.byteLength);
  cryptoSource.getRandomValues(bytes);

  if (options.encoding === 'hex') {
    return Array.from(
      bytes,
      (byte) => `${HEX_ALPHABET[byte >> 4]!}${HEX_ALPHABET[byte & 0x0f]!}`
    ).join('');
  }

  return bytesToBase64Url(bytes);
}

function generatePassword(
  options: PasswordGeneratorOptions,
  cryptoSource: RandomCryptoSource
) {
  const classes = getSelectedPasswordClasses(options);

  if (classes.length === 0) {
    throw new Error('Select at least one password character set.');
  }

  if (options.length < classes.length) {
    throw new Error('Password length must fit every selected character set.');
  }

  validateLength(options.length, 'length');

  const requiredCharacters = classes.map((alphabet) =>
    generateRandomStringFromAlphabet(1, alphabet, cryptoSource)
  );
  const combinedAlphabet = classes.join('');
  const remainingCharacters =
    options.length > requiredCharacters.length
      ? generateRandomStringFromAlphabet(
          options.length - requiredCharacters.length,
          combinedAlphabet,
          cryptoSource
        ).split('')
      : [];

  return shuffleCharacters(
    [...requiredCharacters, ...remainingCharacters],
    cryptoSource
  ).join('');
}

function getSelectedPasswordClasses(options: PasswordGeneratorOptions) {
  const classes: string[] = [];

  if (options.includeUppercase) classes.push(PASSWORD_CLASSES.uppercase);
  if (options.includeLowercase) classes.push(PASSWORD_CLASSES.lowercase);
  if (options.includeNumbers) classes.push(PASSWORD_CLASSES.numbers);
  if (options.includeSymbols) classes.push(PASSWORD_CLASSES.symbols);

  return classes.map((alphabet) =>
    options.excludeAmbiguous
      ? Array.from(alphabet)
          .filter((character) => !AMBIGUOUS_CHARACTERS.has(character))
          .join('')
      : alphabet
  );
}

function shuffleCharacters(
  characters: string[],
  cryptoSource: RandomCryptoSource
) {
  const shuffled = [...characters];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = getRandomInteger(index + 1, cryptoSource);
    const currentCharacter = shuffled[index]!;
    const swapCharacter = shuffled[swapIndex]!;

    [shuffled[index], shuffled[swapIndex]] = [swapCharacter, currentCharacter];
  }

  return shuffled;
}

function getRandomInteger(
  maxExclusive: number,
  cryptoSource: RandomCryptoSource
) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('Maximum must be a positive safe integer.');
  }

  const maxValue = 0x1_0000_0000;
  const maxMultiple = Math.floor(maxValue / maxExclusive) * maxExclusive;
  const bytes = new Uint8Array(4);

  while (true) {
    cryptoSource.getRandomValues(bytes);
    const value =
      ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>>
      0;

    if (value < maxMultiple) {
      return value % maxExclusive;
    }
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let value = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const chunk = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    value += BASE64URL_ALPHABET[(chunk >> 18) & 63]!;
    value += BASE64URL_ALPHABET[(chunk >> 12) & 63]!;
    if (hasSecond) value += BASE64URL_ALPHABET[(chunk >> 6) & 63]!;
    if (hasThird) value += BASE64URL_ALPHABET[chunk & 63]!;
  }

  return value;
}

function estimateEntropyBits(options: RandomGeneratorOptions) {
  switch (options.mode) {
    case 'uuid':
      return 122;
    case 'id':
      return Math.round(options.length * Math.log2(URL_SAFE_ALPHABET.length));
    case 'token':
      return options.byteLength * 8;
    case 'password': {
      const selectedCharacters = getSelectedPasswordClasses(options).join('');
      return selectedCharacters.length > 0
        ? Math.round(options.length * Math.log2(selectedCharacters.length))
        : 0;
    }
  }
}

function validateTokenOptions(options: TokenGeneratorOptions) {
  if (
    !Number.isSafeInteger(options.byteLength) ||
    options.byteLength < 1 ||
    options.byteLength > MAX_TOKEN_BYTES
  ) {
    throw new Error(
      `Token byte length must be between 1 and ${MAX_TOKEN_BYTES}.`
    );
  }
}

function validateBatchCount(batchCount: number) {
  if (
    !Number.isSafeInteger(batchCount) ||
    batchCount < 1 ||
    batchCount > MAX_BATCH_COUNT
  ) {
    throw new Error(`Batch count must be between 1 and ${MAX_BATCH_COUNT}.`);
  }
}

function validateLength(length: number, label: string) {
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > MAX_STRING_LENGTH
  ) {
    throw new Error(`${label} must be between 1 and ${MAX_STRING_LENGTH}.`);
  }
}

function getBrowserCrypto(): RandomCryptoSource {
  const cryptoSource = globalThis.crypto;

  if (!cryptoSource?.getRandomValues) {
    throw new Error('Secure random generation requires Web Crypto.');
  }

  return cryptoSource;
}
