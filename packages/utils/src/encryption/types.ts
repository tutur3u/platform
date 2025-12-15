/**
 * Type definitions for workspace encryption
 */

/**
 * Encrypted calendar event - fields that can be encrypted
 */
export interface EncryptedCalendarEventFields {
  title: string;
  description: string;
  location?: string;
}

/**
 * Calendar event with encryption metadata
 */
export interface CalendarEventWithEncryption {
  id: string;
  title: string;
  description: string;
  location?: string;
  start_at: string;
  end_at: string;
  color?: string;
  ws_id: string;
  is_encrypted: boolean;
  // ... other fields
}

/**
 * Workspace encryption key record from database
 * Re-exported from auto-generated types to stay in sync with schema
 */
export type { WorkspaceEncryptionKey } from '@tuturuuu/types';

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  algorithm: 'AES-GCM';
  keyLength: 256;
  ivLength: 12;
  tagLength: 128;
}

/**
 * Encrypted field format: base64(iv + ciphertext + authTag)
 */
export type EncryptedField = string;
