/**
 * Outbound delivery is at-most-once. A send is recorded as started before
 * the provider call; a started send without a recorded result is uncertain
 * and is never retried automatically.
 */
export type SendState =
  | { status: 'none' }
  | {
      status: 'started';
      idempotencyKey: string;
      startedAtMs: number;
      attempts: number;
    }
  | { status: 'sent'; idempotencyKey: string; providerMessageIds: string[] }
  | {
      status: 'failed';
      idempotencyKey: string;
      retryable: boolean;
      attempts: number;
    }
  | { status: 'uncertain'; idempotencyKey: string };

export type SendPlan =
  | { kind: 'send'; idempotencyKey: string }
  | { kind: 'done' }
  | { kind: 'hold_uncertain' }
  | { kind: 'give_up' };

export const MAX_SEND_ATTEMPTS = 3;

/** Deterministic per turn part, so a resend carries the same identity. */
export function sendIdempotencyKey(turnKey: string, part: number): string {
  if (!Number.isInteger(part) || part < 0) throw new Error('Invalid part');
  return `${turnKey}#${part}`;
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

/**
 * Discord limits message nonces to 25 characters, so the idempotency key is
 * reduced to a 64-bit FNV-1a hash (13 base-36 characters). Collisions only
 * matter within one channel and Discord's short dedupe window.
 */
export function discordNonce(idempotencyKey: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(idempotencyKey)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return `m${hash.toString(36).padStart(13, '0')}`;
}

export function planSend(args: {
  state: SendState;
  turnKey: string;
  part: number;
  nowMs: number;
  /**
   * How long the provider dedupes a resend with the same key (Discord
   * enforce_nonce); null when the provider has no send idempotency.
   */
  providerDedupeWindowMs: number | null;
}): SendPlan {
  const key = sendIdempotencyKey(args.turnKey, args.part);
  const { state } = args;
  switch (state.status) {
    case 'none':
      return { kind: 'send', idempotencyKey: key };
    case 'sent':
      return { kind: 'done' };
    case 'uncertain':
      return { kind: 'hold_uncertain' };
    case 'started': {
      // A crash between start and result. A resend is safe only while the
      // provider still dedupes the key; otherwise the send may have landed.
      const window = args.providerDedupeWindowMs;
      const withinWindow =
        window !== null && args.nowMs - state.startedAtMs < window;
      return withinWindow && state.attempts < MAX_SEND_ATTEMPTS
        ? { kind: 'send', idempotencyKey: state.idempotencyKey }
        : { kind: 'hold_uncertain' };
    }
    case 'failed':
      return state.retryable && state.attempts < MAX_SEND_ATTEMPTS
        ? { kind: 'send', idempotencyKey: state.idempotencyKey }
        : { kind: 'give_up' };
  }
}
