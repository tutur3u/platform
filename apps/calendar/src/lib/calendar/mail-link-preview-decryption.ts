import { createDecipheriv } from 'node:crypto';
import { getWorkspaceKey } from '@/lib/workspace-encryption';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

type StoredCalendarFields = {
  title: string;
  description: string;
  location?: string | null;
  is_encrypted: boolean;
};

/** Same IV + ciphertext + tag format as encryptField; authentication failures never return input. */
function decryptPreviewField(value: string, key: Buffer): string {
  if (value === '') return '';
  const bytes = Buffer.from(value, 'base64');
  if (
    bytes.toString('base64') !== value ||
    bytes.length < IV_LENGTH + AUTH_TAG_LENGTH
  ) {
    throw new Error('Invalid encrypted Calendar field');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    bytes.subarray(0, IV_LENGTH)
  );
  decipher.setAuthTag(bytes.subarray(bytes.length - AUTH_TAG_LENGTH));
  const plaintext = Buffer.concat([
    decipher.update(bytes.subarray(IV_LENGTH, bytes.length - AUTH_TAG_LENGTH)),
    decipher.final(),
  ]);
  return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
}

/** Preview-only strict read: getWorkspaceKey never creates or rotates a workspace key. */
export async function decryptCalendarEventForPreview<
  T extends StoredCalendarFields,
>(event: T, wsId: string): Promise<T | null> {
  if (!event.is_encrypted) return event;
  const key = await getWorkspaceKey(wsId);
  if (!Buffer.isBuffer(key) || key.length !== 32) return null;
  try {
    const title = decryptPreviewField(event.title, key);
    const description = decryptPreviewField(event.description, key);
    const location =
      event.location == null
        ? event.location
        : decryptPreviewField(event.location, key);
    return { ...event, title, description, location, is_encrypted: false };
  } catch {
    return null;
  }
}
