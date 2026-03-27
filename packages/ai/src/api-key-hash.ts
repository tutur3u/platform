import { scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_DERIVATION_LENGTH = 64;

export async function validateApiKeyHash(
  key: string,
  storedHash: string
): Promise<boolean> {
  try {
    const [salt, hash] = storedHash.split(':');

    if (!salt || !hash) {
      return false;
    }

    const derivedKey = (await scryptAsync(
      key,
      salt,
      KEY_DERIVATION_LENGTH
    )) as Buffer;

    return timingSafeEqual(derivedKey, Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}
