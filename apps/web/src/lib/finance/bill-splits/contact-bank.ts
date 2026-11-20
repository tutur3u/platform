import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const bankAccountDetails = z.strictObject({
  accountNumber: z.string().regex(/^[0-9A-Za-z]{4,30}$/),
  holderName: z.string().trim().min(1).max(120),
});

type BankAccountDetails = z.infer<typeof bankAccountDetails>;
type Scope = { wsId: string; contactId: string };

function associatedData({ wsId, contactId }: Scope) {
  return Buffer.from(JSON.stringify(['finance-contact-bank', wsId, contactId]));
}

export function contactBankKey(env: string | undefined) {
  if (!env || !/^[A-Za-z0-9_-]{43}$/.test(env)) return null;
  const key = Buffer.from(env, 'base64url');
  return key.byteLength === 32 && key.toString('base64url') === env
    ? key
    : null;
}

export function encryptBankAccount(
  details: BankAccountDetails,
  scope: Scope,
  key: Buffer
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(associatedData(scope));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(details), 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    ...[iv, cipher.getAuthTag(), encrypted].map((part) =>
      part.toString('base64url')
    ),
  ].join('.');
}

export function decryptBankAccount(
  envelope: string,
  scope: Scope,
  key: Buffer
) {
  const [version, iv, tag, encrypted, extra] = envelope.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted || extra !== undefined) {
    throw new Error('Invalid bank account envelope');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url')
  );
  decipher.setAAD(associatedData(scope));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return bankAccountDetails.parse(
    JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8')
    )
  );
}
