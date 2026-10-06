import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  decryptWorkspaceKey,
  encryptWorkspaceKey,
  generateWorkspaceKey,
  getMasterKey,
} from '@tuturuuu/utils/encryption';

export class DesktopVaultCryptoError extends Error {
  constructor() {
    super('Desktop vault encrypted resource rejected');
    this.name = 'DesktopVaultCryptoError';
  }
}

export type DesktopResourceIdentity = {
  versionId: string;
  platform: 'windows' | 'macos';
  name: string;
};

function aad(identity: DesktopResourceIdentity): Buffer {
  return Buffer.from(
    JSON.stringify([
      'tuturuuu-desktop-vault-v1',
      identity.versionId,
      identity.platform,
      identity.name,
    ]),
    'utf8'
  );
}

function requireKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new DesktopVaultCryptoError();
  }
}

export async function createDesktopDataKey(): Promise<{
  key: Buffer;
  ciphertext: string;
}> {
  const key = generateWorkspaceKey();
  return {
    key,
    ciphertext: await encryptWorkspaceKey(key, getMasterKey()),
  };
}

export async function decryptDesktopDataKey(
  ciphertext: string
): Promise<Buffer> {
  try {
    const key = await decryptWorkspaceKey(ciphertext, getMasterKey());
    requireKey(key);
    return key;
  } catch {
    throw new DesktopVaultCryptoError();
  }
}

export function encryptDesktopResource(
  plaintext: Buffer,
  key: Buffer,
  identity: DesktopResourceIdentity
): { ciphertext: string; sha256: string; size: number } {
  requireKey(key);
  if (plaintext.length === 0 || plaintext.length > 2097152) {
    throw new DesktopVaultCryptoError();
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(identity));
  const bytes = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: JSON.stringify({
      version: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      bytes: bytes.toString('base64'),
    }),
    sha256: createHash('sha256').update(plaintext).digest('hex'),
    size: plaintext.length,
  };
}

export function decryptDesktopResource(
  ciphertext: string,
  key: Buffer,
  identity: DesktopResourceIdentity,
  expected: { sha256: string; size: number }
): Buffer {
  try {
    requireKey(key);
    if (ciphertext.length > 6000000) throw new DesktopVaultCryptoError();
    const parsed: unknown = JSON.parse(ciphertext);
    if (!parsed || typeof parsed !== 'object')
      throw new DesktopVaultCryptoError();
    const payload = parsed as Record<string, unknown>;
    if (
      payload.version !== 1 ||
      typeof payload.iv !== 'string' ||
      typeof payload.tag !== 'string' ||
      typeof payload.bytes !== 'string'
    ) {
      throw new DesktopVaultCryptoError();
    }
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16)
      throw new DesktopVaultCryptoError();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(identity));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.bytes, 'base64')),
      decipher.final(),
    ]);
    if (
      plaintext.length !== expected.size ||
      plaintext.length === 0 ||
      plaintext.length > 2097152 ||
      createHash('sha256').update(plaintext).digest('hex') !== expected.sha256
    ) {
      plaintext.fill(0);
      throw new DesktopVaultCryptoError();
    }
    return plaintext;
  } catch {
    throw new DesktopVaultCryptoError();
  }
}
