import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

export class SepayReconnectRequiredError extends Error {
  constructor() {
    super('Reconnect SePay');
    this.name = 'SepayReconnectRequiredError';
  }
}

function getEncryptionKey() {
  const secret = process.env.SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET?.trim();

  if (!secret) {
    throw new Error('Missing SEPAY_OAUTH_TOKEN_ENCRYPTION_SECRET');
  }

  return createHash('sha256').update(secret).digest();
}

export function encryptSepayToken(token: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
}

export function decryptSepayToken(encryptedToken: string) {
  const [ivPart, ciphertextPart, authTagPart, extra] =
    encryptedToken.split('.');
  if (!ivPart || !ciphertextPart || !authTagPart || extra !== undefined) {
    throw new SepayReconnectRequiredError();
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivPart, 'base64url');
  const ciphertext = Buffer.from(ciphertextPart, 'base64url');
  const authTag = Buffer.from(authTagPart, 'base64url');

  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new SepayReconnectRequiredError();
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = decipher.update(ciphertext);
  let final: Buffer;
  try {
    final = decipher.final();
  } catch {
    throw new SepayReconnectRequiredError();
  }
  return Buffer.concat([decrypted, final]).toString('utf8');
}
