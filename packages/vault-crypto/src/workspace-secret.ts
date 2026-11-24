import { randomBytes, utf8 } from './bytes';
import {
  decodeSymmetricEnvelope,
  encodeSymmetricEnvelope,
  KEY_BYTES,
  openSymmetric,
  sealSymmetric,
} from './aead';
import { VaultCryptoError } from './errors';

/**
 * Credential-tier workspace secret envelopes
 * (apps/docs/platform/architecture/workspace-secrets-encryption.mdx).
 *
 * - The value is sealed under a fresh 256-bit data key with the
 *   `workspace-secret/value` purpose, bound to the row, name, workspace and
 *   value revision, so it cannot be moved or replayed over a newer value.
 * - The data key is sealed under the KEK with the `workspace-secret/wrap`
 *   purpose, bound to the same row and the KEK version. KEK rotation re-wraps
 *   the data key and leaves the value ciphertext byte-identical.
 */

export interface WorkspaceSecretBinding {
  wsId: string;
  secretId: string;
  name: string;
}

export interface SealedWorkspaceSecret {
  ciphertext: Uint8Array;
  wrappedDek: Uint8Array;
  last4: string;
}

function assertRevision(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new VaultCryptoError(
      'invalid_input',
      `${label} must be a safe non-negative integer`
    );
  }
}

function valueContext(binding: WorkspaceSecretBinding, sourceRev: number) {
  assertRevision(sourceRev, 'sourceRev');
  return {
    name: binding.name,
    secretId: binding.secretId,
    sourceRev,
    wsId: binding.wsId,
  };
}

function wrapContext(binding: WorkspaceSecretBinding, kekVersion: number) {
  if (!Number.isSafeInteger(kekVersion) || kekVersion < 1) {
    throw new VaultCryptoError(
      'invalid_input',
      'kekVersion must be a positive integer'
    );
  }
  return {
    kekVersion,
    name: binding.name,
    secretId: binding.secretId,
    wsId: binding.wsId,
  };
}

/** The last four characters shown in the Secrets list, never more. */
export function workspaceSecretLast4(value: string): string {
  const chars = [...value];
  return chars.length > 8 ? chars.slice(-4).join('') : '';
}

export async function sealWorkspaceSecret(input: {
  kek: Uint8Array;
  kekVersion: number;
  binding: WorkspaceSecretBinding;
  sourceRev: number;
  value: string;
}): Promise<SealedWorkspaceSecret> {
  if (input.value.length === 0) {
    throw new VaultCryptoError('invalid_input', 'Value must not be empty');
  }
  const dek = randomBytes(KEY_BYTES);
  try {
    const ciphertext = encodeSymmetricEnvelope(
      await sealSymmetric(
        dek,
        'workspace-secret/value',
        valueContext(input.binding, input.sourceRev),
        utf8(input.value)
      )
    );
    const wrappedDek = encodeSymmetricEnvelope(
      await sealSymmetric(
        input.kek,
        'workspace-secret/wrap',
        wrapContext(input.binding, input.kekVersion),
        dek
      )
    );
    return { ciphertext, last4: workspaceSecretLast4(input.value), wrappedDek };
  } finally {
    dek.fill(0);
  }
}

async function unwrapDek(
  kek: Uint8Array,
  kekVersion: number,
  binding: WorkspaceSecretBinding,
  wrappedDek: Uint8Array
) {
  const dek = await openSymmetric(
    kek,
    'workspace-secret/wrap',
    wrapContext(binding, kekVersion),
    decodeSymmetricEnvelope(wrappedDek)
  );
  if (dek.length !== KEY_BYTES) {
    dek.fill(0);
    throw new VaultCryptoError('decrypt_failed', 'Decryption failed');
  }
  return dek;
}

export async function openWorkspaceSecret(input: {
  kek: Uint8Array;
  kekVersion: number;
  binding: WorkspaceSecretBinding;
  sourceRev: number;
  ciphertext: Uint8Array;
  wrappedDek: Uint8Array;
}): Promise<string> {
  const dek = await unwrapDek(
    input.kek,
    input.kekVersion,
    input.binding,
    input.wrappedDek
  );
  try {
    const plaintext = await openSymmetric(
      dek,
      'workspace-secret/value',
      valueContext(input.binding, input.sourceRev),
      decodeSymmetricEnvelope(input.ciphertext)
    );
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    } finally {
      plaintext.fill(0);
    }
  } finally {
    dek.fill(0);
  }
}

/** Moves a wrapped data key to another KEK version without opening the value. */
export async function rewrapWorkspaceSecretKey(input: {
  fromKek: Uint8Array;
  fromVersion: number;
  toKek: Uint8Array;
  toVersion: number;
  binding: WorkspaceSecretBinding;
  wrappedDek: Uint8Array;
}): Promise<Uint8Array> {
  const dek = await unwrapDek(
    input.fromKek,
    input.fromVersion,
    input.binding,
    input.wrappedDek
  );
  try {
    return encodeSymmetricEnvelope(
      await sealSymmetric(
        input.toKek,
        'workspace-secret/wrap',
        wrapContext(input.binding, input.toVersion),
        dek
      )
    );
  } finally {
    dek.fill(0);
  }
}
