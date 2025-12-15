/**
 * Encryption service for transparent encryption at rest
 *
 * Uses AES-256-GCM for symmetric encryption of sensitive calendar event fields.
 * Workspace keys are encrypted with a master key from environment variables.
 *
 * Security Model:
 * - Master key: stored in ENCRYPTION_MASTER_KEY environment variable
 * - Workspace keys: AES-256 keys, unique per workspace, encrypted with master key
 * - Field encryption: AES-GCM with random IV per encryption
 */

import crypto from 'node:crypto';
import type {
  CalendarEventWithEncryption,
  EncryptedCalendarEventFields,
  EncryptedField,
} from './types';

// Encryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

// Scrypt parameters (explicit for documentation and security auditing)
// N=16384 (2^14) - CPU/memory cost parameter
// r=8 - block size
// p=1 - parallelization parameter
// These are the Node.js defaults but we make them explicit for clarity
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SCRYPT_KEY_LENGTH = 32; // 256 bits
const SCRYPT_SALT = 'workspace-key-salt'; // Fixed salt (per-workspace salt is a future enhancement)

/**
 * Maximum number of derived keys to cache.
 * Prevents unbounded memory growth in long-running processes.
 */
const MAX_CACHE_SIZE = 100;

// Cache for derived keys to avoid repeated scrypt calls
// Key: masterKey, Value: derived key buffer
const derivedKeyCache = new Map<string, Buffer>();

/**
 * Derive a key from master key using scrypt (async, non-blocking)
 * Results are cached to avoid repeated derivation.
 * Cache is bounded to MAX_CACHE_SIZE entries using FIFO eviction.
 */
async function getDerivedKey(masterKey: string): Promise<Buffer> {
  const cached = derivedKeyCache.get(masterKey);
  if (cached) {
    return cached;
  }

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      masterKey,
      SCRYPT_SALT,
      SCRYPT_KEY_LENGTH,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM },
      (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          // Evict oldest entry if cache is at capacity (FIFO eviction)
          if (derivedKeyCache.size >= MAX_CACHE_SIZE) {
            const oldestKey = derivedKeyCache.keys().next().value;
            if (oldestKey !== undefined) {
              derivedKeyCache.delete(oldestKey);
            }
          }
          derivedKeyCache.set(masterKey, derivedKey);
          resolve(derivedKey);
        }
      }
    );
  });
}

/**
 * Generate a new workspace encryption key (256-bit)
 */
export function generateWorkspaceKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * Encrypt a workspace key with the master key
 * @param workspaceKey - The workspace key to encrypt
 * @param masterKey - The master key (from environment variable)
 * @returns Base64-encoded encrypted key
 */
export async function encryptWorkspaceKey(
  workspaceKey: Buffer,
  masterKey: string
): Promise<string> {
  // Derive a consistent key from the master key string (async, cached)
  const derivedKey = await getDerivedKey(masterKey);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(workspaceKey),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv + encrypted + authTag
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/**
 * Decrypt a workspace key with the master key
 * @param encryptedKey - Base64-encoded encrypted key
 * @param masterKey - The master key (from environment variable)
 * @returns The decrypted workspace key
 */
export async function decryptWorkspaceKey(
  encryptedKey: string,
  masterKey: string
): Promise<Buffer> {
  const derivedKey = await getDerivedKey(masterKey);
  const data = Buffer.from(encryptedKey, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Encrypt a single field value
 * @param plaintext - The plaintext value to encrypt
 * @param workspaceKey - The decrypted workspace key
 * @returns Base64-encoded ciphertext (iv + encrypted + authTag)
 */
export function encryptField(
  plaintext: string,
  workspaceKey: Buffer
): EncryptedField {
  if (!plaintext) {
    return ''; // Don't encrypt empty strings
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, workspaceKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/**
 * Decrypt a single field value
 * @param ciphertext - Base64-encoded ciphertext
 * @param workspaceKey - The decrypted workspace key
 * @returns The decrypted plaintext
 */
export function decryptField(
  ciphertext: EncryptedField,
  workspaceKey: Buffer
): string {
  if (!ciphertext) {
    return ''; // Handle empty strings
  }

  const data = Buffer.from(ciphertext, 'base64');

  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    // Data too short to be encrypted - may indicate corruption or truncation
    // Log a warning with diagnostic info (scrubbed to avoid leaking sensitive data)
    const expectedMinLength = IV_LENGTH + AUTH_TAG_LENGTH;
    const scrubbedSample = `${ciphertext.slice(0, 8)}...`;
    console.warn(
      `[decryptField] Data too short to decrypt: got ${data.length} bytes, ` +
        `expected at least ${expectedMinLength} bytes. ` +
        `Ciphertext sample: "${scrubbedSample}" (length: ${ciphertext.length}). ` +
        `Returning original value for backward compatibility.`
    );
    return ciphertext;
  }

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, workspaceKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8'
  );
}

/**
 * Encrypt sensitive fields of a calendar event
 * @param event - The calendar event with plaintext fields
 * @param workspaceKey - The decrypted workspace key
 * @returns The event with encrypted title, description, location
 */
export function encryptCalendarEventFields(
  event: EncryptedCalendarEventFields,
  workspaceKey: Buffer
): EncryptedCalendarEventFields {
  return {
    title: encryptField(event.title || '', workspaceKey),
    description: encryptField(event.description || '', workspaceKey),
    location: event.location
      ? encryptField(event.location, workspaceKey)
      : undefined,
  };
}

/**
 * Decrypt sensitive fields of a calendar event
 * @param event - The calendar event with encrypted fields
 * @param workspaceKey - The decrypted workspace key
 * @returns The event with decrypted title, description, location
 */
export function decryptCalendarEventFields(
  event: EncryptedCalendarEventFields,
  workspaceKey: Buffer
): EncryptedCalendarEventFields {
  return {
    title: decryptField(event.title || '', workspaceKey),
    description: decryptField(event.description || '', workspaceKey),
    location: event.location
      ? decryptField(event.location, workspaceKey)
      : undefined,
  };
}

/**
 * Check if encryption is enabled (master key is configured)
 */
export function isEncryptionEnabled(): boolean {
  return !!process.env.ENCRYPTION_MASTER_KEY;
}

/**
 * Get the master key from environment
 * @throws Error if master key is not configured
 */
export function getMasterKey(): string {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY environment variable is not configured'
    );
  }
  return masterKey;
}

/**
 * Batch decrypt multiple calendar events
 */
export function decryptCalendarEvents<T extends CalendarEventWithEncryption>(
  events: T[],
  workspaceKey: Buffer
): T[] {
  return events.map((event) => {
    if (!event.is_encrypted) {
      return event; // Already plaintext
    }
    const decrypted = decryptCalendarEventFields(
      {
        title: event.title ?? '',
        description: event.description ?? '',
        location: event.location ?? undefined,
      },
      workspaceKey
    );
    return {
      ...event,
      ...decrypted,
    };
  });
}

/**
 * Batch encrypt multiple calendar events
 */
export function encryptCalendarEvents<T extends EncryptedCalendarEventFields>(
  events: T[],
  workspaceKey: Buffer
): (T & { is_encrypted: boolean })[] {
  return events.map((event) => {
    const encrypted = encryptCalendarEventFields(
      {
        title: event.title,
        description: event.description,
        location: event.location,
      },
      workspaceKey
    );
    return {
      ...event,
      ...encrypted,
      is_encrypted: true,
    };
  });
}
