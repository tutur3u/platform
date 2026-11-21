import { Aes256Gcm, CipherSuite } from '@hpke/core';
import { DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/dhkem-x25519';
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
import { ENC_ID_BYTES } from './aead';
import { VaultCryptoError } from './errors';

/**
 * HPKE base mode, RFC 9180: DHKEM(X25519, HKDF-SHA256), HKDF-SHA256,
 * AES-256-GCM. The X25519 KEM is the pure-JS implementation so the same code
 * runs in browsers, Bun, Node and Workers regardless of WebCrypto X25519.
 */
const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Aes256Gcm(),
});

export const X25519_KEY_BYTES = 32;

export type KemKeyPair = {
  readonly publicKey: Uint8Array;
  readonly privateKey: Uint8Array;
};

export type HpkeEnvelope = {
  readonly v: number;
  readonly suite: number;
  readonly enc_id: Uint8Array;
  readonly enc: Uint8Array;
  readonly ct: Uint8Array;
};

async function serializePair(pair: CryptoKeyPair): Promise<KemKeyPair> {
  return {
    publicKey: new Uint8Array(
      await suite.kem.serializePublicKey(pair.publicKey)
    ),
    privateKey: new Uint8Array(
      await suite.kem.serializePrivateKey(pair.privateKey)
    ),
  };
}

export async function generateKemKeyPair(): Promise<KemKeyPair> {
  return serializePair(await suite.kem.generateKeyPair());
}

/** RFC 9180 §7.1.3 DeriveKeyPair, for keys derived from a high-entropy secret. */
export async function deriveKemKeyPair(ikm: Uint8Array): Promise<KemKeyPair> {
  if (ikm.length < 32) {
    throw new VaultCryptoError(
      'invalid_input',
      'IKM must be at least 32 bytes'
    );
  }
  return serializePair(await suite.kem.deriveKeyPair(asBufferSource(ikm)));
}

function boundContext(
  purpose: Purpose,
  context: CanonicalObject,
  encId: Uint8Array
) {
  if ('enc_id' in context) {
    throw new VaultCryptoError('invalid_input', 'Context must not set enc_id');
  }
  return asBufferSource(contextBytes(purpose, { ...context, enc_id: encId }));
}

/** Seals to a public key. The context is both HPKE `info` and AEAD `aad`. */
export async function sealTo(
  recipientPublicKey: Uint8Array,
  purpose: Purpose,
  context: CanonicalObject,
  plaintext: Uint8Array
): Promise<HpkeEnvelope> {
  requireLength(recipientPublicKey, X25519_KEY_BYTES, 'Public key');
  const encId = randomBytes(ENC_ID_BYTES);
  const ctx = boundContext(purpose, context, encId);
  let publicKey: CryptoKey;
  try {
    publicKey = await suite.kem.deserializePublicKey(
      asBufferSource(recipientPublicKey)
    );
  } catch {
    throw new VaultCryptoError('invalid_input', 'Invalid public key');
  }
  let sender: Awaited<ReturnType<typeof suite.createSenderContext>>;
  let ct: ArrayBuffer;
  try {
    sender = await suite.createSenderContext({
      recipientPublicKey: publicKey,
      info: ctx,
    });
    ct = await sender.seal(asBufferSource(plaintext), ctx);
  } catch {
    // The KEM rejects low-order public keys during Diffie-Hellman.
    throw new VaultCryptoError('invalid_input', 'Invalid public key');
  }
  return {
    v: FORMAT_VERSION,
    suite: SUITE_ID,
    enc_id: encId,
    enc: new Uint8Array(sender.enc),
    ct: new Uint8Array(ct),
  };
}

export async function openWith(
  recipientPrivateKey: Uint8Array,
  purpose: Purpose,
  context: CanonicalObject,
  envelope: HpkeEnvelope
): Promise<Uint8Array> {
  requireLength(recipientPrivateKey, X25519_KEY_BYTES, 'Private key');
  assertSupported(envelope.v, envelope.suite);
  requireLength(envelope.enc_id, ENC_ID_BYTES, 'enc_id');
  requireLength(envelope.enc, X25519_KEY_BYTES, 'enc');
  const ctx = boundContext(purpose, context, envelope.enc_id);
  try {
    const recipientKey = await suite.kem.deserializePrivateKey(
      asBufferSource(recipientPrivateKey)
    );
    const recipient = await suite.createRecipientContext({
      recipientKey,
      enc: asBufferSource(envelope.enc),
      info: ctx,
    });
    return new Uint8Array(
      await recipient.open(asBufferSource(envelope.ct), ctx)
    );
  } catch {
    throw new VaultCryptoError('decrypt_failed', 'Decryption failed');
  }
}

const ENVELOPE_FIELDS = ['v', 'suite', 'enc_id', 'enc', 'ct'] as const;

export function encodeHpkeEnvelope(envelope: HpkeEnvelope): Uint8Array {
  return encodeCanonical({ ...envelope });
}

export function decodeHpkeEnvelope(bytes: Uint8Array): HpkeEnvelope {
  const o = decodeObject(bytes, ENVELOPE_FIELDS);
  if (
    typeof o.v !== 'number' ||
    typeof o.suite !== 'number' ||
    !(o.enc_id instanceof Uint8Array) ||
    !(o.enc instanceof Uint8Array) ||
    !(o.ct instanceof Uint8Array)
  ) {
    throw new VaultCryptoError('unsupported_format', 'Invalid envelope');
  }
  assertSupported(o.v, o.suite);
  return { v: o.v, suite: o.suite, enc_id: o.enc_id, enc: o.enc, ct: o.ct };
}
