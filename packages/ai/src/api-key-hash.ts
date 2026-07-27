import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_DERIVATION_LENGTH = 64;
const AI_KEY_PREFIX = 'ttr_ai_';
const KEY_LOOKUP_BYTES = 8;
const KEY_SECRET_BYTES = 32;

export type GeneratedAiApiKey = {
  hash: string;
  prefix: string;
  secret: string;
};

export async function hashApiKey(key: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(
    key,
    salt,
    KEY_DERIVATION_LENGTH
  )) as Buffer;

  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function generateAiApiKey(): Promise<GeneratedAiApiKey> {
  const prefix = `${AI_KEY_PREFIX}${randomBytes(KEY_LOOKUP_BYTES).toString('hex')}`;
  const secret = `${prefix}_${randomBytes(KEY_SECRET_BYTES).toString('base64url')}`;

  return {
    hash: await hashApiKey(secret),
    prefix,
    secret,
  };
}

export function extractAiApiKeyPrefix(key: string): string | null {
  if (!key.startsWith(AI_KEY_PREFIX)) return null;

  const separatorIndex = key.indexOf('_', AI_KEY_PREFIX.length);
  if (separatorIndex === -1) return null;

  const prefix = key.slice(0, separatorIndex);
  return prefix.length === AI_KEY_PREFIX.length + KEY_LOOKUP_BYTES * 2
    ? prefix
    : null;
}

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
