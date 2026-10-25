import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  PasswordsError,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';

export const MACHINE_TTL_MS = 15 * 60 * 1000;
export const GRANT_TTL_MS = 24 * 60 * 60 * 1000;
export type MachineProof = { tokenId: string; digest: string };

export function parseMachineToken(token: string): MachineProof {
  const match = /^pwm1\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) throw new PasswordsError('UNAUTHENTICATED');
  const tokenId = uuid(match[1]);
  const bytes = Buffer.from(match[2]!, 'base64url');
  try {
    if (bytes.length !== 32 || bytes.toString('base64url') !== match[2])
      throw new PasswordsError('UNAUTHENTICATED');
    return {
      tokenId,
      digest: createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    bytes.fill(0);
  }
}

export function mintMachineToken() {
  const bytes = randomBytes(32);
  try {
    const tokenId = randomUUID();
    return {
      token: `pwm1.${tokenId}.${bytes.toString('base64url')}`,
      tokenId,
      digest: createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    bytes.fill(0);
  }
}
