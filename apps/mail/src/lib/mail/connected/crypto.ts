import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const value = process.env.MAIL_CONNECTED_ACCOUNTS_KEY;
  if (!value || !/^[a-f0-9]{64}$/iu.test(value))
    throw new Error('Connected mail encryption is not configured');
  return Buffer.from(value, 'hex');
}

export function seal(value: unknown, owner: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(owner));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function unseal<T>(value: string, owner: string): T {
  const [iv, tag, encrypted] = value
    .split('.')
    .map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !encrypted)
    throw new Error('Invalid encrypted mail credential');
  const cipher = createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(owner));
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(encrypted), cipher.final()]).toString()
  );
}
