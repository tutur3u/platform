import { asBufferSource, randomBytes, requireLength } from './bytes';
import {
  type CanonicalObject,
  decodeObject,
  encodeCanonical,
} from './canonical';
import {
  assertSupported,
  contextBytes,
  FORMAT_VERSION,
  type Purpose,
  SUITE_ID,
} from './context';
import { VaultCryptoError } from './errors';
import { hkdfSha256 } from './kdf';

export const KEY_BYTES = 32;
export const ENC_ID_BYTES = 16;
const NONCE_BYTES = 12;

export type SymmetricEnvelope = {
  readonly v: number;
  readonly suite: number;
  readonly enc_id: Uint8Array;
  readonly nonce: Uint8Array;
  readonly ct: Uint8Array;
};

/**
 * Every message is encrypted under its own one-time key,
 * `HKDF(K, salt = enc_id, info = label ‖ ctx)`, with a fresh 128-bit random
 * `enc_id`. A long-lived key therefore never encrypts two messages directly,
 * so retries and concurrent writers share no AES-GCM nonce budget. Two
 * messages collide on a subkey with probability below 2^-32 after 2^48
 * encryptions under one long-lived key.
 */
async function messageKey(
  key: Uint8Array,
  encId: Uint8Array,
  ctx: Uint8Array
): Promise<CryptoKey> {
  const raw = await hkdfSha256(key, encId, ctx, KEY_BYTES);
  return globalThis.crypto.subtle.importKey(
    'raw',
    asBufferSource(raw),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
}

function boundContext(
  purpose: Purpose,
  context: CanonicalObject,
  encId: Uint8Array
) {
  if ('enc_id' in context) {
    throw new VaultCryptoError('invalid_input', 'Context must not set enc_id');
  }
  return contextBytes(purpose, { ...context, enc_id: encId });
}

export async function sealSymmetric(
  key: Uint8Array,
  purpose: Purpose,
  context: CanonicalObject,
  plaintext: Uint8Array
): Promise<SymmetricEnvelope> {
  requireLength(key, KEY_BYTES, 'Key');
  const encId = randomBytes(ENC_ID_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const ctx = boundContext(purpose, context, encId);
  const ct = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asBufferSource(nonce),
      additionalData: asBufferSource(ctx),
      tagLength: 128,
    },
    await messageKey(key, encId, ctx),
    asBufferSource(plaintext)
  );
  return {
    v: FORMAT_VERSION,
    suite: SUITE_ID,
    enc_id: encId,
    nonce,
    ct: new Uint8Array(ct),
  };
}

export async function openSymmetric(
  key: Uint8Array,
  purpose: Purpose,
  context: CanonicalObject,
  envelope: SymmetricEnvelope
): Promise<Uint8Array> {
  requireLength(key, KEY_BYTES, 'Key');
  assertSupported(envelope.v, envelope.suite);
  requireLength(envelope.enc_id, ENC_ID_BYTES, 'enc_id');
  requireLength(envelope.nonce, NONCE_BYTES, 'Nonce');
  const ctx = boundContext(purpose, context, envelope.enc_id);
  try {
    const pt = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asBufferSource(envelope.nonce),
        additionalData: asBufferSource(ctx),
        tagLength: 128,
      },
      await messageKey(key, envelope.enc_id, ctx),
      asBufferSource(envelope.ct)
    );
    return new Uint8Array(pt);
  } catch {
    throw new VaultCryptoError('decrypt_failed', 'Decryption failed');
  }
}

const ENVELOPE_FIELDS = ['v', 'suite', 'enc_id', 'nonce', 'ct'] as const;

export function encodeSymmetricEnvelope(
  envelope: SymmetricEnvelope
): Uint8Array {
  return encodeCanonical({ ...envelope });
}

export function decodeSymmetricEnvelope(bytes: Uint8Array): SymmetricEnvelope {
  const o = decodeObject(bytes, ENVELOPE_FIELDS);
  if (
    typeof o.v !== 'number' ||
    typeof o.suite !== 'number' ||
    !(o.enc_id instanceof Uint8Array) ||
    !(o.nonce instanceof Uint8Array) ||
    !(o.ct instanceof Uint8Array)
  ) {
    throw new VaultCryptoError('unsupported_format', 'Invalid envelope');
  }
  assertSupported(o.v, o.suite);
  return { v: o.v, suite: o.suite, enc_id: o.enc_id, nonce: o.nonce, ct: o.ct };
}
