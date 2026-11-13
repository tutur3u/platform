import type { JSONContent } from '@tiptap/react';

const lockKey = 'tuturuuuLock';
const iterations = 150000;

type LockEnvelope = {
  version: 1;
  mode?: 'device';
  recovery?: string;
  lockId?: string;
  salt: string;
  nonce: string;
  ciphertext: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function noteLockEnvelope(document: unknown): LockEnvelope | null {
  if (!document || typeof document !== 'object') return null;
  const attrs = (document as { attrs?: Record<string, unknown> }).attrs;
  const envelope = attrs?.[lockKey];
  if (!envelope || typeof envelope !== 'object') return null;
  const value = envelope as Partial<LockEnvelope>;
  return value.version === 1 &&
    typeof value.salt === 'string' &&
    typeof value.nonce === 'string' &&
    typeof value.ciphertext === 'string'
    ? (value as LockEnvelope)
    : null;
}

export function isDeviceLockedNote(document: unknown): boolean {
  return noteLockEnvelope(document)?.mode === 'device';
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: salt as BufferSource },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptNote(
  document: JSONContent,
  passphrase: string
): Promise<JSONContent> {
  if (!passphrase) throw new Error('Passphrase is required');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      key,
      new TextEncoder().encode(JSON.stringify(document))
    )
  );
  return {
    type: 'doc',
    attrs: {
      [lockKey]: {
        version: 1,
        salt: toBase64(salt),
        nonce: toBase64(nonce),
        ciphertext: toBase64(ciphertext),
      },
    },
    content: [],
  };
}

export async function decryptNote(
  document: unknown,
  passphrase: string
): Promise<JSONContent> {
  const envelope = noteLockEnvelope(document);
  if (!envelope) throw new Error('Not a locked note');
  const salt = fromBase64(envelope.salt);
  const nonce = fromBase64(envelope.nonce);
  const ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length !== 16 || nonce.length !== 12 || ciphertext.length < 16) {
    throw new Error('Invalid locked note');
  }
  const key = await deriveKey(passphrase, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource },
    key,
    ciphertext as BufferSource
  );
  const parsed: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { type?: string }).type !== 'doc'
  ) {
    throw new Error('Invalid note content');
  }
  return parsed as JSONContent;
}
