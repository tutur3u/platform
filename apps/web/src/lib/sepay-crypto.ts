import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

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
  const [ivPart, ciphertextPart, authTagPart] = encryptedToken.split('.');

  if (!ivPart || !ciphertextPart || !authTagPart) {
    throw new Error('Invalid encrypted SePay token format');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivPart, 'base64url');
  const ciphertext = Buffer.from(ciphertextPart, 'base64url');
  const authTag = Buffer.from(authTagPart, 'base64url');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
