import { createHash } from 'node:crypto';
import { decryptBytes, encryptBytes } from './crypto';
import {
  integer,
  PASSWORDS_MAX_BYTES,
  PASSWORDS_MAX_CIPHERTEXT,
  PasswordsError,
  type PasswordsScope,
  scopeIds,
  uuid,
} from './passwords-contract';

export type PasswordsFileContext = PasswordsScope & {
  version: number;
  itemId: string;
  fileId: string;
};

export function passwordsFilePath(context: PasswordsFileContext) {
  scopeIds(context);
  return `${context.wsId}/${context.vaultId}/${integer(context.version, 1, 1000)}/${uuid(context.itemId)}/${uuid(context.fileId)}`;
}

function aad(context: PasswordsFileContext, kind: 'file' | 'metadata') {
  return Buffer.from(
    `passwords:v1:${kind}:${passwordsFilePath(context)}`,
    'utf8'
  );
}

// Derived only from public operation identity; never from secret bytes or metadata.
function identityUuid(identity: string) {
  const bytes = createHash('sha256').update(identity).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function passwordsPhaseId(requestId: string, phase: 'key' | 'snapshot') {
  return identityUuid(`passwords:v1:${phase}:${uuid(requestId)}`);
}

export function passwordsObjectId(requestId: string, itemId: string) {
  return identityUuid(`passwords:v1:file:${uuid(requestId)}:${uuid(itemId)}`);
}

function strictEnvelope(bytes: Uint8Array, max: number) {
  if (bytes.byteLength > max) throw new PasswordsError('TOO_LARGE');
  const value: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  );
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new PasswordsError('UNAVAILABLE');
  const envelope = value as Record<string, unknown>;
  if (
    Object.keys(envelope).sort().join(',') !== 'alg,ciphertext,iv,tag' ||
    envelope.alg !== 'A256GCM'
  )
    throw new PasswordsError('UNAVAILABLE');
  for (const field of ['iv', 'tag', 'ciphertext']) {
    const encoded = envelope[field];
    if (typeof encoded !== 'string') throw new PasswordsError('UNAVAILABLE');
    const decoded = Buffer.from(encoded, 'base64');
    if (
      decoded.toString('base64') !== encoded ||
      (field === 'iv' && decoded.length !== 12) ||
      (field === 'tag' && decoded.length !== 16)
    )
      throw new PasswordsError('UNAVAILABLE');
  }
}

export function sealPasswordsFile(
  plaintext: Uint8Array,
  key: Buffer,
  context: PasswordsFileContext
) {
  if (plaintext.byteLength > PASSWORDS_MAX_BYTES)
    throw new PasswordsError('TOO_LARGE');
  const format = Buffer.from('{"format":"bytes","version":1}', 'utf8');
  try {
    return {
      ciphertext: encryptBytes(plaintext, key, aad(context, 'file')),
      encryptedMetadata: new TextDecoder().decode(
        encryptBytes(format, key, aad(context, 'metadata'))
      ),
    };
  } finally {
    format.fill(0);
  }
}

export function openPasswordsFile(
  ciphertext: Uint8Array,
  encryptedMetadata: string,
  key: Buffer,
  context: PasswordsFileContext
) {
  let format: Buffer | undefined;
  let plaintext: Buffer | undefined;
  try {
    const metadata = Buffer.from(encryptedMetadata, 'utf8');
    strictEnvelope(metadata, 65536);
    strictEnvelope(ciphertext, PASSWORDS_MAX_CIPHERTEXT);
    format = decryptBytes(metadata, key, aad(context, 'metadata'));
    if (format.toString('utf8') !== '{"format":"bytes","version":1}')
      throw new PasswordsError('UNAVAILABLE');
    plaintext = decryptBytes(ciphertext, key, aad(context, 'file'));
    if (plaintext.byteLength > PASSWORDS_MAX_BYTES)
      throw new PasswordsError('TOO_LARGE');
    return plaintext;
  } catch {
    plaintext?.fill(0);
    throw new PasswordsError('UNAVAILABLE');
  } finally {
    format?.fill(0);
  }
}
