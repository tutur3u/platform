/**
 * One vault's witness: the commit point for key-log entries and version
 * records, and the signer of snapshot attestations. Synchronous; the Durable
 * Object runs each call in one storage transaction.
 */
import {
  equalBytes,
  genesisHash,
  randomBytes,
  type SignedAttestation,
  type SignedGenesis,
  signAttestation,
  VaultCryptoError,
  vaultIdOf,
  verifyKeyLog,
  verifyWitnessConfirmation,
  type WitnessHeadView,
} from '@tuturuuu/vault-crypto';
import { createMeter, type MeteredOp } from './meter';
import { asBytes, blob, decode, encode, type SqlRunner } from './store';
import { levelsProof } from './tree';
import { type AppendRequest, appendTransition } from './vault-append';
import { CAPS, createVaultState, ZERO_HASH } from './vault-state';

export type Signer = {
  readonly generation: number;
  readonly secretKey: Uint8Array;
};

export type Failure = {
  readonly ok: false;
  readonly error:
    | 'not_initialized'
    | 'conflict'
    | 'reattest_required'
    | 'not_reattesting'
    | 'rate_limited'
    | 'misconfigured'
    | 'rejected'
    | 'limit';
  readonly message?: string;
  readonly view?: WitnessHeadView;
};

export const CHALLENGE_TTL_MS = 120_000;
const MAX_TRANSITIONS_PER_READ = 100;

export type Proof =
  | {
      readonly variable_id: string;
      readonly index: number;
      readonly path: Uint8Array[];
    }
  | { readonly variable_id: string; readonly index: null };

export function createVaultEngine(sql: SqlRunner, signer: Signer) {
  const vault = createVaultState(sql);
  const meter = createMeter(sql);
  vault.ensure();
  meter.ensure();
  const fail = (error: Failure['error'], message?: string): Failure => ({
    ok: false,
    error,
    ...(message ? { message } : {}),
  });

  /**
   * Common entry: the signer generation must not be older than the stored
   * one, and a newer generation puts an initialized vault into re-attest
   * until an owner confirms the head. Then one unit of `op` is metered.
   */
  function enter(op: MeteredOp, now: number): Failure | null {
    const stored = vault.generation();
    if (stored !== null && stored > signer.generation)
      return fail('misconfigured', 'Signing key generation went backwards');
    if (stored !== null && stored < signer.generation) {
      vault.meta.setNum('generation', signer.generation);
      if (vault.initialized()) vault.meta.setNum('reattest', 1);
    }
    if (!meter.take(op, now)) return fail('rate_limited');
    return null;
  }

  function ready(op: MeteredOp, now: number, allowReattest = false) {
    const failure = enter(op, now);
    if (failure) return failure;
    if (!vault.initialized()) return fail('not_initialized');
    if (!allowReattest && vault.reattest())
      return { ...fail('reattest_required'), view: vault.view() };
    return null;
  }

  return {
    invalidate: () => vault.invalidate(),

    init(
      input: { vault_id: Uint8Array; genesis: SignedGenesis },
      deployment: string,
      now: number
    ) {
      const failure = enter('admin', now);
      if (failure) return failure;
      if (vault.initialized()) {
        const same =
          equalBytes(vault.vaultId(), input.vault_id) &&
          equalBytes(genesisHash(vault.genesis()), genesisHash(input.genesis));
        return same ? { ok: true as const, created: false } : fail('conflict');
      }
      try {
        if (!equalBytes(vaultIdOf(input.genesis.body), input.vault_id))
          return fail('rejected', 'Genesis does not hash to this vault');
        verifyKeyLog(input.genesis, [], {
          deployment,
          vaultId: input.vault_id,
        });
      } catch (error) {
        if (error instanceof VaultCryptoError)
          return fail('rejected', error.message);
        throw error;
      }
      vault.meta.setBytes('deployment', new TextEncoder().encode(deployment));
      vault.meta.setBytes('vault_id', input.vault_id);
      vault.meta.setBytes('genesis', asBytes(encode(input.genesis)));
      vault.meta.setNum('generation', signer.generation);
      vault.meta.setNum('revision', 0);
      vault.meta.setNum('reattest', 0);
      vault.invalidate();
      return { ok: true as const, created: true };
    },

    challenge(now: number) {
      const failure = ready('challenge', now);
      if (failure) return failure;
      sql.exec('DELETE FROM challenges WHERE expires_at <= ?', now).toArray();
      const open = Number(
        sql.exec('SELECT count(*) AS n FROM challenges').toArray()[0]?.n ?? 0
      );
      if (open >= CAPS.outstandingChallenges)
        return fail('limit', 'Too many open challenges');
      const nonce = randomBytes(16);
      const expires_at = now + CHALLENGE_TTL_MS;
      sql
        .exec(
          'INSERT INTO challenges (nonce, expires_at) VALUES (?, ?)',
          blob(nonce),
          expires_at
        )
        .toArray();
      return { ok: true as const, challenge: nonce, expires_at };
    },

    attest(
      input: {
        nonce: Uint8Array | null;
        proofs: { env: string; variable_ids: string[] } | null;
      },
      now: number
    ) {
      const failure = ready('attest', now);
      if (failure) return failure;
      if (
        input.proofs &&
        input.proofs.variable_ids.length > CAPS.proofsPerAttest
      )
        return fail('limit', 'Too many proofs');
      const view = vault.view();
      const attestation: SignedAttestation = signAttestation(signer.secretKey, {
        ...view,
        issued_at: Math.floor(now / 1000),
        request_nonce: input.nonce,
      });
      const proofs: Proof[] = [];
      if (input.proofs) {
        const { levels, ids } = vault.tree(input.proofs.env);
        for (const variable_id of input.proofs.variable_ids) {
          const index = ids.indexOf(variable_id);
          proofs.push(
            index < 0
              ? { variable_id, index: null }
              : { variable_id, index, path: levelsProof(levels, index) }
          );
        }
      }
      return { ok: true as const, attestation, proofs };
    },

    append(request: AppendRequest, now: number) {
      const failure = ready('append', now);
      if (failure) return failure;
      return appendTransition(sql, vault, request, now);
    },

    /** Committed transitions after `after`, for idempotent publication. */
    transitions(input: { after: number; limit: number }, now: number) {
      const failure = ready('read', now, true);
      if (failure) return failure;
      const limit = Math.min(
        Math.max(input.limit, 1),
        MAX_TRANSITIONS_PER_READ
      );
      const rows = sql
        .exec(
          'SELECT body FROM transitions WHERE revision > ? ORDER BY revision LIMIT ?',
          input.after,
          limit
        )
        .toArray();
      const transitions = rows.map((row) => {
        const body = decode<{
          revision: number;
          entry_seq: number | null;
          record_hashes: Uint8Array[];
          payload_hashes: Uint8Array[];
          committed_at: number;
        }>(row.body);
        const entry =
          body.entry_seq === null
            ? null
            : decode(
                sql
                  .exec(
                    'SELECT signed FROM entries WHERE seq = ?',
                    body.entry_seq
                  )
                  .toArray()[0]?.signed
              );
        const records = body.record_hashes.map((h) => vault.recordByHash(h));
        return { ...body, entry, records };
      });
      return { ok: true as const, revision: vault.revision(), transitions };
    },

    /**
     * Advances the server-trusted audit chain head. The witness cannot see
     * events; it only refuses a head that does not name the current one or
     * does not grow the event count, so a later rewrite is detectable
     * against any attestation that carried the older head.
     */
    audit(
      input: {
        prev_audit_head: Uint8Array;
        audit_head: Uint8Array;
        event_count: number;
      },
      now: number
    ) {
      const failure = ready('append', now);
      if (failure) return failure;
      if (
        !equalBytes(input.prev_audit_head, vault.auditHead()) ||
        input.event_count <= vault.auditCount() ||
        equalBytes(input.audit_head, ZERO_HASH)
      ) {
        return fail('conflict', 'Audit head does not extend the current head');
      }
      vault.meta.setBytes('audit_head', input.audit_head);
      vault.meta.setNum('audit_count', input.event_count);
      return { ok: true as const };
    },

    /** An owner's signed confirmation of the exact head ends re-attest. */
    confirm(confirmation: unknown, now: number) {
      const failure = ready('admin', now, true);
      if (failure) return failure;
      if (!vault.reattest()) return fail('not_reattesting');
      try {
        verifyWitnessConfirmation(
          confirmation,
          vault.view(),
          vault.keyLog().state
        );
      } catch (error) {
        if (error instanceof VaultCryptoError)
          return fail('rejected', error.message);
        throw error;
      }
      vault.meta.setNum('reattest', 0);
      return { ok: true as const };
    },
  };
}

export type VaultEngine = ReturnType<typeof createVaultEngine>;
