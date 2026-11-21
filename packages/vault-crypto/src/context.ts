import { concatBytes, utf8 } from './bytes';
import { type CanonicalObject, encodeCanonical } from './canonical';
import { VaultCryptoError } from './errors';

/**
 * Every AEAD additional-data string, HPKE info, HKDF info and signature input
 * is a domain label followed by the canonical encoding of its context, so a
 * value produced for one purpose or row can never verify for another.
 */
export const PURPOSES = [
  'value',
  'wrap',
  'unlock',
  'keyring',
  'grant',
  'kek/passkey',
  'kek/recovery',
  'kek/pin',
  'invite',
  'invite-challenge',
  'pair-request',
  'pair-transcript',
  'record',
  'key-log',
  'fingerprint',
  'genesis',
  'record-hash',
  'entry-hash',
  'snapshot-leaf',
  'attestation',
  'edk-id',
  'keyring-head',
  'keyring-head-hash',
  'keyring-attestation',
  'keyring-confirm',
  'witness-confirm',
] as const;

export type Purpose = (typeof PURPOSES)[number];

export const FORMAT_VERSION = 1;
export const SUITE_ID = 1;

export function domainLabel(purpose: Purpose): string {
  if (!PURPOSES.includes(purpose)) {
    throw new VaultCryptoError('invalid_input', 'Unknown purpose');
  }
  return `tuturuuu/vault/${purpose}/v${FORMAT_VERSION}`;
}

/** `label ‖ 0x00 ‖ CBOR(context)`; labels never contain a zero byte. */
export function contextBytes(
  purpose: Purpose,
  context: CanonicalObject
): Uint8Array {
  return concatBytes(
    utf8(domainLabel(purpose)),
    new Uint8Array([0]),
    encodeCanonical(context)
  );
}

/** Fields every context carries so objects cannot cross deployments or vaults. */
export type VaultScope = {
  readonly deployment: string;
  readonly vault_id: Uint8Array;
};

export function assertSupported(v: unknown, suite: unknown): void {
  if (v !== FORMAT_VERSION || suite !== SUITE_ID) {
    throw new VaultCryptoError(
      'unsupported_format',
      'Unsupported version or suite'
    );
  }
}
