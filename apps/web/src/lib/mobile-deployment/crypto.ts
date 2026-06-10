import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  decryptField,
  decryptWorkspaceKey,
  encryptField,
  encryptWorkspaceKey,
  generateWorkspaceKey,
  getMasterKey,
} from '@tuturuuu/utils/encryption';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class MobileDeploymentEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MobileDeploymentEncryptionError';
  }
}

type EncryptedBytesPayload = {
  alg: 'A256GCM';
  ciphertext: string;
  iv: string;
  tag: string;
};

function requireDataKey(dataKey: Buffer) {
  if (!Buffer.isBuffer(dataKey) || dataKey.length !== 32) {
    throw new MobileDeploymentEncryptionError(
      'Mobile deployment data key is invalid'
    );
  }
}

export function sha256Base64Url(buffer: Uint8Array | string) {
  return createHash('sha256').update(buffer).digest('base64url');
}

export function sha256Hex(buffer: Uint8Array | string) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function createEncryptedDataKey() {
  const masterKey = getMasterKey();
  const dataKey = generateWorkspaceKey();
  return {
    dataKey,
    encryptedDataKey: await encryptWorkspaceKey(dataKey, masterKey),
  };
}

export async function decryptDataKey(encryptedDataKey: string) {
  const masterKey = getMasterKey();
  const dataKey = await decryptWorkspaceKey(encryptedDataKey, masterKey);
  requireDataKey(dataKey);
  return dataKey;
}

export function encryptSecretValue(value: string, dataKey: Buffer) {
  requireDataKey(dataKey);
  return encryptField(value, dataKey);
}

export function decryptSecretValue(ciphertext: string, dataKey: Buffer) {
  requireDataKey(dataKey);
  return decryptField(ciphertext, dataKey);
}

export function encryptBytes(plaintext: Uint8Array, dataKey: Buffer) {
  requireDataKey(dataKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv, {
    authTagLength: TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);
  const payload: EncryptedBytesPayload = {
    alg: 'A256GCM',
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };

  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decryptBytes(payloadBytes: Uint8Array, dataKey: Buffer) {
  requireDataKey(dataKey);
  let payload: EncryptedBytesPayload;

  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new MobileDeploymentEncryptionError(
      'Encrypted mobile deployment file payload is not valid JSON'
    );
  }

  if (payload.alg !== 'A256GCM') {
    throw new MobileDeploymentEncryptionError(
      'Encrypted mobile deployment file payload uses an unsupported algorithm'
    );
  }

  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new MobileDeploymentEncryptionError(
      'Encrypted mobile deployment file payload metadata is invalid'
    );
  }

  const decipher = createDecipheriv(ALGORITHM, dataKey, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function redactLastFour(value: string) {
  return value.length <= 4 ? value : value.slice(-4);
}
