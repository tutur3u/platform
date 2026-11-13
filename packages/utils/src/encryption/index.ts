/**
 * Encryption utilities for transparent encryption at rest
 */

export {
  decryptCalendarEventFields,
  decryptCalendarEvents,
  decryptField,
  decryptWorkspaceKey,
  encryptCalendarEventFields,
  encryptCalendarEvents,
  encryptField,
  encryptWorkspaceKey,
  generateWorkspaceKey,
  getMasterKey,
  isEncryptionEnabled,
} from './encryption-service';

export {
  EncryptionUnavailableError,
  isEncryptionRequired,
} from './encryption-required';

export type {
  CalendarEventWithEncryption,
  EncryptedCalendarEventFields,
  EncryptedField,
  EncryptionConfig,
  WorkspaceEncryptionKey,
} from './types';
