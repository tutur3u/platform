import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class VaultEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultEncryptionError';
  }
}

export interface VaultKeyWrapper {
  wrap(dataKey: Buffer): Promise<string>;
  unwrap(encryptedDataKey: string): Promise<Buffer>;
}

function requireDataKey(dataKey: Buffer) {
  if (!Buffer.isBuffer(dataKey) || dataKey.length !== 32) {
    throw new VaultEncryptionError('Vault data key is invalid');
  }
}

export function sha256Base64Url(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('base64url');
}

export function sha256Hex(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function createEncryptedDataKey(wrapper: VaultKeyWrapper) {
  const dataKey = randomBytes(32);
  try {
    return { dataKey, encryptedDataKey: await wrapper.wrap(dataKey) };
  } catch {
    dataKey.fill(0);
    throw new VaultEncryptionError('Vault key wrapping failed');
  }
}

export async function decryptDataKey(
  encryptedDataKey: string,
  wrapper: VaultKeyWrapper
) {
  try {
    const dataKey = await wrapper.unwrap(encryptedDataKey);
    requireDataKey(dataKey);
    return dataKey;
  } catch {
    throw new VaultEncryptionError('Vault key authentication failed');
  }
}

export function encryptSecretValue(value: string, dataKey: Buffer) {
  requireDataKey(dataKey);
  if (!value) return '';
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv, {
    authTagLength: TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString(
    'base64'
  );
}

export function decryptSecretValue(ciphertext: string, dataKey: Buffer) {
  requireDataKey(dataKey);
  if (!ciphertext) return '';
  const payload = Buffer.from(ciphertext, 'base64');
  if (payload.length < IV_BYTES + TAG_BYTES) {
    throw new VaultEncryptionError('Encrypted vault secret payload is invalid');
  }
  try {
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(payload.length - TAG_BYTES);
    const encrypted = payload.subarray(IV_BYTES, payload.length - TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, dataKey, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new VaultEncryptionError(
      'Encrypted vault secret authentication failed'
    );
  }
}

export function encryptBytes(
  plaintext: Uint8Array,
  dataKey: Buffer,
  associatedData?: Uint8Array
) {
  requireDataKey(dataKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dataKey, iv, {
    authTagLength: TAG_BYTES,
  });
  if (associatedData) cipher.setAAD(associatedData);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return new TextEncoder().encode(
    JSON.stringify({
      alg: 'A256GCM',
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    })
  );
}

function parseEnvelope(payloadBytes: Uint8Array) {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    throw new VaultEncryptionError('Encrypted vault file payload is invalid');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('alg' in value) ||
    value.alg !== 'A256GCM' ||
    !('iv' in value) ||
    typeof value.iv !== 'string' ||
    !('tag' in value) ||
    typeof value.tag !== 'string' ||
    !('ciphertext' in value) ||
    typeof value.ciphertext !== 'string'
  ) {
    throw new VaultEncryptionError('Encrypted vault file metadata is invalid');
  }
  const iv = Buffer.from(value.iv, 'base64');
  const tag = Buffer.from(value.tag, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new VaultEncryptionError('Encrypted vault file metadata is invalid');
  }
  return { iv, tag, ciphertext: Buffer.from(value.ciphertext, 'base64') };
}

export function decryptBytes(
  payloadBytes: Uint8Array,
  dataKey: Buffer,
  associatedData?: Uint8Array
) {
  requireDataKey(dataKey);
  const { iv, tag, ciphertext } = parseEnvelope(payloadBytes);
  try {
    const decipher = createDecipheriv(ALGORITHM, dataKey, iv, {
      authTagLength: TAG_BYTES,
    });
    if (associatedData) decipher.setAAD(associatedData);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new VaultEncryptionError(
      'Encrypted vault file authentication failed'
    );
  }
}
