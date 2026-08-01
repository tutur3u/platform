import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { decryptField, encryptField } from '@tuturuuu/utils/encryption';
import {
  getOrCreateWorkspaceKey,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';

export function createIngestSecret() {
  return `ecs_${randomBytes(32).toString('base64url')}`;
}

export function hashExternalChatSecret(secret: string) {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function secretLastFour(secret: string) {
  return secret.slice(-4);
}

export function verifyExternalChatSecret(secret: string, expectedHash: string) {
  const actual = Buffer.from(hashExternalChatSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function encryptControlSecret(wsId: string, secret: string) {
  const key = await getOrCreateWorkspaceKey(wsId);
  if (!key) throw new Error('Workspace encryption is required');
  return encryptField(secret, key);
}

export async function decryptControlSecret(wsId: string, ciphertext: string) {
  const key = await getWorkspaceKey(wsId);
  if (!key) throw new Error('Workspace encryption key is unavailable');
  return decryptField(ciphertext, key);
}

export function signControlRequest({
  body,
  secret,
  timestamp,
}: {
  body: string;
  secret: string;
  timestamp: string;
}) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');
}
