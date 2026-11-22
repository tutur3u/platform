// Mastermind secret entry, protocol v1: binding strings, machine and owner
// signatures (Ed25519 from node:crypto, i.e. OpenSSL) and the plaintext
// codec. HPKE itself runs only in CryptoKit: the `mm-secret-hpke` helper on
// the machine (secret-hpke/) and the iOS plugin on the phone. The shared byte
// fixture in secret-fixture.json keeps every implementation identical.
// Design: apps/docs/build/devops/mastermind-secret-entry.mdx.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from 'node:crypto';

export const SECRET_PROTOCOL_VERSION = '1';
export const HPKE_INFO = 'tuturuuu-mm-secret-v1';
export const REQUEST_DOMAIN = 'tuturuuu-mm-secret-request-v1';
export const ANSWER_DOMAIN = 'tuturuuu-mm-secret-answer-v1';
export const OWNER_DOMAIN = 'tuturuuu-mm-secret-owner-v1';
export const OUTCOME_DOMAIN = 'tuturuuu-mm-secret-outcome-v1';
/** Largest value the phone may send, in UTF-8 bytes. */
export const SECRET_MAX_BYTES = 4096;
/** Plaintext is padded to a multiple of this, so only the bucket leaks. */
export const SECRET_PAD_BLOCK = 256;
export const SECRET_MAX_BLOCKS = 17;
/** Longest bound `command` JSON text. */
export const COMMAND_MAX = 8192;
const PLAINTEXT_SINGLE_VALUE = 0x01;
const TAG_BYTES = 16;

export const SECRET_OUTCOMES = [
  'delivered',
  'failed',
  'declined',
  'expired',
  'cancelled',
  'paired',
];

const ED25519_PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const B64URL = /^[A-Za-z0-9_-]*$/;

/** Unpadded base64url. */
export const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

/**
 * Decodes canonical unpadded base64url of exactly `length` bytes, or null.
 * Canonical means re-encoding gives the same text, so one key has one
 * spelling and binds one way.
 */
export function fromB64url(text, length) {
  if (typeof text !== 'string' || !B64URL.test(text)) return null;
  const bytes = Buffer.from(text, 'base64url');
  if (length !== undefined && bytes.length !== length) return null;
  return bytes.toString('base64url') === text ? bytes : null;
}

export const sha256Hex = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');

/** Request fields after the domain, in protocol order. Every one is a string. */
export const REQUEST_FIELDS = [
  'v',
  'requestId',
  'machineId',
  'requester',
  'operation',
  'command',
  'output',
  'purpose',
  'expiresAt',
  'publicKey',
  'signerKey',
  'audience',
];

/**
 * `B(domain, fields)`: the domain, then each field as a 4-byte big-endian
 * length and its UTF-8 bytes.
 */
export function lengthPrefixed(domain, values) {
  const parts = [];
  for (const value of [domain, ...values]) {
    if (typeof value !== 'string') throw new Error('secret_binding_field');
    const bytes = Buffer.from(value, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    parts.push(length, bytes);
  }
  return Buffer.concat(parts);
}

/** REQUEST_DOMAIN for the machine signature, ANSWER_DOMAIN for the HPKE AAD. */
export const bindingBytes = (domain, request) =>
  lengthPrefixed(
    domain,
    REQUEST_FIELDS.map((field) => request[field])
  );

/** Ed25519 private key from a 32-byte seed. */
export function signerFromSeed(seed) {
  if (seed.length !== 32) throw new Error('secret_signer_seed');
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

/** The raw 32-byte public key of an Ed25519 key object. */
export const rawPublicKey = (key) =>
  createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(-32);

/** Whether `signature` is a valid Ed25519 signature by the raw key. */
export function verifyEd25519(publicKeyRaw, message, signature) {
  if (publicKeyRaw?.length !== 32 || signature?.length !== 64) return false;
  try {
    return verify(
      null,
      message,
      createPublicKey({
        key: Buffer.concat([ED25519_SPKI, publicKeyRaw]),
        format: 'der',
        type: 'spki',
      }),
      signature
    );
  } catch {
    return false;
  }
}

export const signRequest = (signer, request) =>
  sign(null, bindingBytes(REQUEST_DOMAIN, request), signer);

export const verifyRequest = (request, signature) =>
  verifyEd25519(
    fromB64url(request.signerKey, 32),
    bindingBytes(REQUEST_DOMAIN, request),
    signature
  );

/** First 16 bytes of SHA-256 of an owner key, as lowercase hex. */
export const ownerKeyId = (ownerKeyRaw) => sha256Hex(ownerKeyRaw).slice(0, 32);

/**
 * What the owner signs for an answer: the request (by the digest of its
 * binding), the action, the sealed payload (empty strings for a decline),
 * when, and with which key.
 */
export const ownerTranscript = (
  request,
  { action, enc, ct, signedAt, keyId }
) =>
  lengthPrefixed(OWNER_DOMAIN, [
    request.requestId,
    sha256Hex(bindingBytes(REQUEST_DOMAIN, request)),
    action,
    enc,
    ct,
    signedAt,
    keyId,
  ]);

/**
 * A machine-signed outcome names the request, the outcome and the answer it
 * settled on: the SHA-256 hex of the winning owner transcript, the enrolled
 * owner key id for `paired`, or the empty string when no answer won.
 */
export const outcomeBytes = (requestId, outcome, answerDigest) =>
  lengthPrefixed(OUTCOME_DOMAIN, [requestId, outcome, answerDigest]);

export function signOutcome(signer, requestId, outcome, answerDigest = '') {
  if (!SECRET_OUTCOMES.includes(outcome)) throw new Error('secret_outcome');
  return sign(null, outcomeBytes(requestId, outcome, answerDigest), signer);
}

/** SHA-256 of the machine key, first 16 bytes as four groups of 8 hex. */
export const signerFingerprint = (signerKeyRaw) =>
  sha256Hex(signerKeyRaw).slice(0, 32).toUpperCase().match(/.{8}/g).join(' ');

/** SHA-256 of the request binding, first 4 bytes as `XXXX-XXXX`. */
export function requestCode(request) {
  const hex = sha256Hex(bindingBytes(REQUEST_DOMAIN, request)).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

/** Version byte, 2-byte length, the UTF-8 value, zeros to the bucket. */
export function encodeSecretPlaintext(valueBytes) {
  if (valueBytes.length < 1 || valueBytes.length > SECRET_MAX_BYTES)
    throw new Error('secret_value_length');
  const used = 3 + valueBytes.length;
  const out = Buffer.alloc(
    Math.ceil(used / SECRET_PAD_BLOCK) * SECRET_PAD_BLOCK
  );
  out[0] = PLAINTEXT_SINGLE_VALUE;
  out.writeUInt16BE(valueBytes.length, 1);
  Buffer.from(valueBytes.buffer, valueBytes.byteOffset, valueBytes.length).copy(
    out,
    3
  );
  return out;
}

/**
 * The value bytes (a view into `plaintext`), or throws when the version,
 * length, padding, bucket or UTF-8 is wrong. The caller zeroes the buffer.
 */
export function decodeSecretPlaintext(plaintext) {
  if (
    plaintext.length < SECRET_PAD_BLOCK ||
    plaintext.length > SECRET_MAX_BLOCKS * SECRET_PAD_BLOCK ||
    plaintext.length % SECRET_PAD_BLOCK !== 0 ||
    plaintext[0] !== PLAINTEXT_SINGLE_VALUE
  )
    throw new Error('secret_plaintext');
  const length = plaintext.readUInt16BE(1);
  if (length < 1 || length > SECRET_MAX_BYTES || 3 + length > plaintext.length)
    throw new Error('secret_plaintext');
  for (let i = 3 + length; i < plaintext.length; i++)
    if (plaintext[i] !== 0) throw new Error('secret_plaintext');
  if (plaintext.length - (3 + length) >= SECRET_PAD_BLOCK)
    throw new Error('secret_plaintext');
  const value = plaintext.subarray(3, 3 + length);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(value);
  } catch {
    throw new Error('secret_plaintext');
  }
  return value;
}

/** The sealed lengths the relay and the machine both enforce. */
export function sealedShapeOk(enc, ct) {
  const body = ct.length - TAG_BYTES;
  return (
    enc.length === 32 &&
    body >= SECRET_PAD_BLOCK &&
    body % SECRET_PAD_BLOCK === 0 &&
    body <= SECRET_MAX_BLOCKS * SECRET_PAD_BLOCK
  );
}
