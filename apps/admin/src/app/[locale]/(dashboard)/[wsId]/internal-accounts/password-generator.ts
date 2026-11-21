const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*+-=?';
const ALL_CHARACTERS = `${LOWERCASE}${UPPERCASE}${DIGITS}${SYMBOLS}`;

function secureIndex(max: number) {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Secure password generation is unavailable');
  }

  const limit = Math.floor(256 / max) * max;
  const value = new Uint8Array(1);

  do {
    globalThis.crypto.getRandomValues(value);
  } while (value[0]! >= limit);

  return value[0]! % max;
}

function pick(characters: string) {
  return characters[secureIndex(characters.length)]!;
}

export function generateSecureTemporaryPassword(length = 20) {
  if (length < 12) {
    throw new Error('Temporary passwords must contain at least 12 characters');
  }

  const password = [
    pick(LOWERCASE),
    pick(UPPERCASE),
    pick(DIGITS),
    pick(SYMBOLS),
    ...Array.from({ length: length - 4 }, () => pick(ALL_CHARACTERS)),
  ];

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = secureIndex(index + 1);
    [password[index], password[swapIndex]] = [
      password[swapIndex]!,
      password[index]!,
    ];
  }

  return password.join('');
}
