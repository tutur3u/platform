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
export function encryptWorkspaceKey(
  workspaceKey: Buffer,
  masterKey: string
): string {
  // Derive a consistent key from the master key string
  const derivedKey = crypto.scryptSync(masterKey, 'workspace-key-salt', 32);
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
export function decryptWorkspaceKey(
  encryptedKey: string,
  masterKey: string
): Buffer {
  const derivedKey = crypto.scryptSync(masterKey, 'workspace-key-salt', 32);
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
    // Data too short to be encrypted, return as-is (for backward compatibility)
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
        title: event.title,
        description: event.description,
        location: event.location,
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
