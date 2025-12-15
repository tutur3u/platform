/**
 * Type definitions for workspace encryption
 */

import type { Tables } from '@tuturuuu/types';

/**
 * Encrypted calendar event - fields that can be encrypted
 */
export interface EncryptedCalendarEventFields {
  title: string;
  description: string;
  location?: string;
}

/**
 * Base calendar event type from database schema
 */
type BaseCalendarEvent = Tables<'workspace_calendar_events'>;

/**
 * Calendar event with encryption metadata
 * Derived from canonical DB types to stay in sync with schema changes
 */
export type CalendarEventWithEncryption = Pick<
  BaseCalendarEvent,
  | 'id'
  | 'title'
  | 'description'
  | 'location'
  | 'start_at'
  | 'end_at'
  | 'color'
  | 'ws_id'
  | 'is_encrypted'
>;

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
