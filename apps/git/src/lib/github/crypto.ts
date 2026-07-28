import 'server-only';

import { createHash } from 'node:crypto';
import {
  decryptField,
  decryptWorkspaceKey,
  encryptField,
  encryptWorkspaceKey,
  generateWorkspaceKey,
  getMasterKey,
} from '@tuturuuu/utils/encryption';

function assertDataKey(dataKey: Buffer) {
  if (!Buffer.isBuffer(dataKey) || dataKey.length !== 32) {
    throw new Error('Git credential data key is invalid');
  }
}

export async function createEncryptedGitDataKey() {
  const dataKey = generateWorkspaceKey();
  return {
    dataKey,
    encryptedDataKey: await encryptWorkspaceKey(dataKey, getMasterKey()),
  };
}

export async function decryptGitDataKey(value: string) {
  const dataKey = await decryptWorkspaceKey(value, getMasterKey());
  assertDataKey(dataKey);
  return dataKey;
}

export function encryptGitSecret(value: string, dataKey: Buffer) {
  assertDataKey(dataKey);
  return encryptField(value, dataKey);
}

export function decryptGitSecret(value: string, dataKey: Buffer) {
  assertDataKey(dataKey);
  return decryptField(value, dataKey);
}

export function gitSecretFingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
