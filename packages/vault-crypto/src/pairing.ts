import { equalBytes, randomBytes } from './bytes';
import {
  type CanonicalObject,
  decodeObject,
  encodeCanonical,
} from './canonical';
import {
  assertSupported,
  contextBytes,
  FORMAT_VERSION,
  SUITE_ID,
} from './context';
import { VaultCryptoError } from './errors';
import { sha256 } from './kdf';
import { fingerprint } from './keys';

/**
 * Fragment pairing. The CLI prints an approval URL whose fragment carries the
 * device key fingerprints and a pairing secret. The fragment never reaches the
 * server, so the approval page can check that the keys it wraps to are the
 * keys the machine generated.
 */
export type PairingFragment = {
  readonly v: number;
  readonly suite: number;
  readonly request_id: Uint8Array;
  readonly encryption_fp: Uint8Array;
  readonly signing_fp: Uint8Array;
  readonly pairing_secret: Uint8Array;
};

export type DeviceKeys = {
  readonly encryption_key: Uint8Array;
  readonly signing_key: Uint8Array;
};

const FRAGMENT_FIELDS = [
  'v',
  'suite',
  'request_id',
  'encryption_fp',
  'signing_fp',
  'pairing_secret',
] as const;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) {
    throw new VaultCryptoError('invalid_input', 'Invalid fragment');
  }
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function createPairingFragment(
  requestId: Uint8Array,
  keys: DeviceKeys
): PairingFragment {
  if (requestId.length !== 16)
    throw new VaultCryptoError('invalid_input', 'request_id length');
  return {
    v: FORMAT_VERSION,
    suite: SUITE_ID,
    request_id: requestId,
    encryption_fp: fingerprint('x25519', keys.encryption_key),
    signing_fp: fingerprint('ed25519', keys.signing_key),
    pairing_secret: randomBytes(16),
  };
}

export function encodePairingFragment(fragment: PairingFragment): string {
  return toBase64Url(encodeCanonical({ ...fragment }));
}

export function decodePairingFragment(input: string): PairingFragment {
  const o = decodeObject(fromBase64Url(input), FRAGMENT_FIELDS);
  assertSupported(o.v, o.suite);
  const bytesField = (name: string, length: number) => {
    const value = o[name];
    if (!(value instanceof Uint8Array) || value.length !== length) {
      throw new VaultCryptoError(
        'unsupported_format',
        'Invalid fragment field'
      );
    }
    return value;
  };
  return {
    v: FORMAT_VERSION,
    suite: SUITE_ID,
    request_id: bytesField('request_id', 16),
    encryption_fp: bytesField('encryption_fp', 32),
    signing_fp: bytesField('signing_fp', 32),
    pairing_secret: bytesField('pairing_secret', 16),
  };
}

/** Throws unless the keys the server relayed are the keys in the fragment. */
export function assertFragmentMatches(
  fragment: PairingFragment,
  requestId: Uint8Array,
  keys: DeviceKeys
): void {
  const ok =
    equalBytes(fragment.request_id, requestId) &&
    equalBytes(
      fragment.encryption_fp,
      fingerprint('x25519', keys.encryption_key)
    ) &&
    equalBytes(fragment.signing_fp, fingerprint('ed25519', keys.signing_key));
  if (!ok)
    throw new VaultCryptoError(
      'bad_mac',
      'Device keys do not match the pairing link'
    );
}

/** Hash of the approval transcript the approver signs and redemption binds. */
export function transcriptHash(transcript: CanonicalObject): Uint8Array {
  return sha256(contextBytes('pair-transcript', transcript));
}
