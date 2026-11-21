import { decodeBase32, encodeBase32, groupCode } from './base32';
import { randomBytes } from './bytes';

export const RECOVERY_KEY_BYTES = 32;

export function generateRecoveryKey(): Uint8Array {
  return randomBytes(RECOVERY_KEY_BYTES);
}

/** 256 bits as 52 Crockford base32 characters in groups of four. */
export function formatRecoveryKey(key: Uint8Array): string {
  if (key.length !== RECOVERY_KEY_BYTES)
    throw new RangeError('Recovery key length');
  return groupCode(encodeBase32(key));
}

/**
 * Parses a typed recovery key. Typos are caught by a failed unwrap rather
 * than a checksum, so a wrong key reveals nothing beyond "does not unlock".
 */
export function parseRecoveryKey(input: string): Uint8Array {
  return decodeBase32(input, RECOVERY_KEY_BYTES);
}

/** The group index the user re-enters to confirm they saved the key. */
export function confirmationGroup(formatted: string, index: number): string {
  const groups = formatted.split('-');
  const group = groups[index];
  if (group === undefined) throw new RangeError('Group index');
  return group;
}
