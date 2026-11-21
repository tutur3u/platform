import { equalBytes, requireLength } from './bytes';
import { contextBytes, type VaultScope } from './context';
import { VaultCryptoError } from './errors';
import { hmacSha256 } from './kdf';

export const INVITE_SECRET_BYTES = 32;

/** Canonical invite context, signed by the inviting admin. */
export type InviteContext = VaultScope & {
  readonly invite_id: Uint8Array;
  readonly recipient_user_id: string;
  readonly recipient_email_hash: Uint8Array;
  readonly environments: readonly string[];
  readonly level: string;
  readonly expires_at: number;
};

export type ProposedIdentityKeys = {
  readonly encryption_key: Uint8Array;
  readonly signing_key: Uint8Array;
};

/**
 * HMAC proving the invitee holds the out-of-band invite secret, over the full
 * invite context and the identity keys it proposes.
 */
export function inviteMac(
  secret: Uint8Array,
  context: InviteContext,
  keys: ProposedIdentityKeys
): Uint8Array {
  requireLength(secret, INVITE_SECRET_BYTES, 'Invite secret');
  return hmacSha256(
    secret,
    contextBytes('invite', { context: { ...context }, keys: { ...keys } })
  );
}

export function assertInviteMac(
  secret: Uint8Array,
  context: InviteContext,
  keys: ProposedIdentityKeys,
  mac: Uint8Array
): void {
  if (!equalBytes(inviteMac(secret, context, keys), mac)) {
    throw new VaultCryptoError('bad_mac', 'Invite binding failed');
  }
}
