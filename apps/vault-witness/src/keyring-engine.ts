/**
 * One user's keyring authority: accepts a new keyring head only when it
 * extends the current head under the identity key in force, and signs the
 * current head on request so a replayed older keyring fails on any machine.
 */
import {
  equalBytes,
  keyringHeadHash,
  type SignedKeyringHead,
  signKeyringAttestation,
  VaultCryptoError,
  verifyKeyringConfirmation,
  verifyKeyringSuccessor,
} from '@tuturuuu/vault-crypto';
import { createMeter, type MeteredOp } from './meter';
import { asBytes, createMeta, decode, encode, type SqlRunner } from './store';
import type { Failure, Signer } from './vault-engine';

export type KeyringPending = {
  readonly deployment: string;
  readonly vault_user_id: Uint8Array;
  readonly witness_generation: number;
  readonly counter: number;
  readonly head_hash: Uint8Array;
};

export function createKeyringEngine(sql: SqlRunner, signer: Signer) {
  const meta = createMeta(sql);
  const meter = createMeter(sql);
  meta.ensure();
  meter.ensure();
  const fail = (error: Failure['error'], message?: string) => ({
    ok: false as const,
    error,
    ...(message ? { message } : {}),
  });
  const current = (): SignedKeyringHead | null => {
    const b = meta.bytes('head');
    return b ? decode<SignedKeyringHead>(b) : null;
  };

  function pending(head: SignedKeyringHead): KeyringPending {
    return {
      deployment: head.head.deployment,
      vault_user_id: head.head.vault_user_id,
      witness_generation: meta.num('generation') ?? signer.generation,
      counter: head.head.counter,
      head_hash: keyringHeadHash(head),
    };
  }

  /** See the vault engine: generation ratchet, re-attest on rotation, metering. */
  function enter(op: MeteredOp, now: number, allowReattest = false) {
    const stored = meta.num('generation');
    if (stored !== null && stored > signer.generation)
      return fail('misconfigured', 'Signing key generation went backwards');
    if (stored === null || stored < signer.generation) {
      meta.setNum('generation', signer.generation);
      if (stored !== null && current()) meta.setNum('reattest', 1);
    }
    if (!meter.take(op, now)) return fail('rate_limited');
    const head = current();
    if (!allowReattest && head && meta.num('reattest') === 1)
      return { ...fail('reattest_required'), pending: pending(head) };
    return null;
  }

  return {
    put(
      input: { deployment: string; vault_user_id: Uint8Array; head: unknown },
      now: number
    ) {
      const failure = enter('append', now);
      if (failure) return failure;
      const head = current();
      try {
        const next = verifyKeyringSuccessor(input.head, head, {
          deployment: input.deployment,
          vaultUserId: input.vault_user_id,
        });
        meta.setBytes('head', asBytes(encode(next)));
        return { ok: true as const, counter: next.head.counter };
      } catch (error) {
        if (error instanceof VaultCryptoError)
          return fail('rejected', error.message);
        throw error;
      }
    },

    attest(
      input: { vault_user_id: Uint8Array; nonce: Uint8Array | null },
      now: number
    ) {
      const failure = enter('attest', now);
      if (failure) return failure;
      const head = current();
      if (!head || !equalBytes(head.head.vault_user_id, input.vault_user_id))
        return fail('not_initialized');
      return {
        ok: true as const,
        head,
        attestation: signKeyringAttestation(signer.secretKey, {
          ...pending(head),
          witness_generation: signer.generation,
          keyring_hash: head.head.keyring_hash,
          issued_at: Math.floor(now / 1000),
          request_nonce: input.nonce,
        }),
      };
    },

    confirm(input: { signature: Uint8Array }, now: number) {
      const failure = enter('admin', now, true);
      if (failure) return failure;
      const head = current();
      if (!head || meta.num('reattest') !== 1) return fail('not_reattesting');
      try {
        verifyKeyringConfirmation(
          input.signature,
          pending(head),
          head.head.next_signing_key ?? head.head.signing_key
        );
      } catch (error) {
        if (error instanceof VaultCryptoError)
          return fail('rejected', error.message);
        throw error;
      }
      meta.setNum('reattest', 0);
      return { ok: true as const };
    },
  };
}

export type KeyringEngine = ReturnType<typeof createKeyringEngine>;
