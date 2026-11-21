import {
  assertLatestRecord,
  assertMatchesKeyLog,
  randomBytes,
  type SignedAttestation,
  type SignedRecord,
  signWitnessConfirmation,
  verifyAttestation,
  verifyKeyLog,
  type WitnessHeadView,
} from '@tuturuuu/vault-crypto';
import { describe, expect, it } from 'vite-plus/test';
import { type Harness, harness } from './harness';
import { LIMITS } from './meter';
import { DEPLOYMENT, makeGenesis, party, record } from './test-support';

function attest(
  h: Harness,
  variableIds: string[] = [],
  nonce = randomBytes(16)
) {
  const out = h.run((e) =>
    e.attest(
      {
        nonce,
        proofs: variableIds.length
          ? { env: 'prod', variable_ids: variableIds }
          : null,
      },
      h.now
    )
  );
  if (!out.ok) throw new Error(`attest failed: ${out.error}`);
  return { ...out, nonce };
}

function clientVerify(
  h: Harness,
  signed: SignedAttestation,
  nonce: Uint8Array,
  floors = { seq: 0, revision: 0, generation: 1 }
) {
  return verifyAttestation(signed, {
    scope: h.scope,
    witnessKeys: h.keys,
    minGeneration: floors.generation,
    now: Math.floor(h.now / 1000),
    floorSeq: floors.seq,
    floorRevision: floors.revision,
    expectedNonce: nonce,
  });
}

describe('genesis', () => {
  it('is idempotent for the same genesis and refuses another', async () => {
    const h = await harness();
    const again = h.run((e) =>
      e.init(
        { vault_id: h.log.vaultId, genesis: h.log.genesis },
        DEPLOYMENT,
        h.now
      )
    );
    expect(again).toMatchObject({ ok: true, created: false });
    const other = makeGenesis([party('mallory')]);
    expect(
      h.run((e) =>
        e.init({ vault_id: h.log.vaultId, genesis: other }, DEPLOYMENT, h.now)
      )
    ).toMatchObject({ ok: false, error: 'conflict' });
  });

  it('refuses a genesis that does not hash to the routed vault', async () => {
    const h = await harness();
    h.db.db.exec('DELETE FROM meta');
    h.restart();
    const other = makeGenesis([party('mallory')]);
    expect(
      h.run((e) =>
        e.init({ vault_id: h.log.vaultId, genesis: other }, DEPLOYMENT, h.now)
      )
    ).toMatchObject({ ok: false, error: 'rejected' });
  });
});

describe('snapshots and attestations', () => {
  it('attests the latest record per variable and rejects superseded values', async () => {
    const h = await harness();
    const v1 = record(h.log.vaultId, h.owner);
    expect(h.submit(null, [v1])).toMatchObject({ ok: true, revision: 2 });
    const first = attest(h, ['var-1', 'missing']);
    const a1 = clientVerify(h, first.attestation, first.nonce);
    assertMatchesKeyLog(
      a1,
      verifyKeyLog(h.log.genesis, h.log.entries, h.log.pinned)
    );
    const proof = first.proofs[0] as { index: number; path: Uint8Array[] };
    expect(() => assertLatestRecord(a1, v1, proof)).not.toThrow();
    expect(first.proofs[1]).toEqual({ variable_id: 'missing', index: null });

    const v2 = record(h.log.vaultId, h.owner, { prev: v1 });
    expect(h.submit(null, [v2])).toMatchObject({ ok: true, revision: 3 });
    const second = attest(h, ['var-1']);
    const a2 = clientVerify(h, second.attestation, second.nonce, {
      seq: 1,
      revision: 2,
      generation: 1,
    });
    const p2 = second.proofs[0] as { index: number; path: Uint8Array[] };
    expect(() => assertLatestRecord(a2, v2, p2)).not.toThrow();
    expect(() => assertLatestRecord(a2, v1, p2)).toThrow(/latest/);
    // The older attestation is now behind a client that saw revision 3.
    expect(() =>
      clientVerify(h, first.attestation, first.nonce, {
        seq: 1,
        revision: 3,
        generation: 1,
      })
    ).toThrow(/floor/);
  });

  it('declares environments from the key log with empty roots', async () => {
    const h = await harness();
    const out = attest(h);
    expect(out.attestation.attestation.env_roots).toEqual([
      expect.objectContaining({ env: 'prod', size: 0 }),
    ]);
  });
});

describe('restart and generation rotation', () => {
  it('rebuilds the same view from storage on a cold start', async () => {
    const h = await harness();
    h.submit(null, [record(h.log.vaultId, h.owner)]);
    const before = attest(h).attestation.attestation;
    h.restart();
    const after = attest(h).attestation.attestation;
    expect({ ...after, issued_at: 0, request_nonce: null }).toEqual({
      ...before,
      issued_at: 0,
      request_nonce: null,
    });
  });

  it('enters re-attest on a new generation until an owner confirms the exact head', async () => {
    const h = await harness();
    const v1 = record(h.log.vaultId, h.owner);
    h.submit(null, [v1]);
    h.restart(2);
    const blocked = h.run((e) =>
      e.attest({ nonce: null, proofs: null }, h.now)
    );
    expect(blocked).toMatchObject({ ok: false, error: 'reattest_required' });
    const view = (blocked as { view: WitnessHeadView }).view;
    expect(view).toMatchObject({ witness_generation: 2, revision: 2, seq: 1 });
    expect(
      h.submit(null, [record(h.log.vaultId, h.owner, { prev: v1 })])
    ).toMatchObject({
      ok: false,
      error: 'reattest_required',
    });

    const outsider = party('outsider');
    const forged = signWitnessConfirmation(
      outsider.pair.secretKey,
      outsider.signing_key,
      view
    );
    expect(h.run((e) => e.confirm(forged, h.now))).toMatchObject({
      ok: false,
      error: 'rejected',
    });
    const stale = signWitnessConfirmation(
      h.owner.pair.secretKey,
      h.owner.signing_key,
      {
        ...view,
        revision: 1,
      }
    );
    expect(h.run((e) => e.confirm(stale, h.now))).toMatchObject({
      ok: false,
      error: 'rejected',
    });
    const good = signWitnessConfirmation(
      h.owner.pair.secretKey,
      h.owner.signing_key,
      view
    );
    expect(h.run((e) => e.confirm(good, h.now))).toEqual({ ok: true });

    const out = attest(h);
    expect(() =>
      clientVerify(h, out.attestation, out.nonce, {
        seq: 1,
        revision: 2,
        generation: 2,
      })
    ).not.toThrow();
    expect(out.attestation.attestation.witness_generation).toBe(2);
    expect(h.run((e) => e.confirm(good, h.now))).toMatchObject({
      error: 'not_reattesting',
    });
  });

  it('fails closed when the signing generation goes backwards', async () => {
    const h = await harness();
    h.restart(3);
    h.run((e) => e.challenge(h.now));
    h.restart(2);
    expect(
      h.run((e) => e.attest({ nonce: null, proofs: null }, h.now))
    ).toMatchObject({
      ok: false,
      error: 'misconfigured',
    });
  });
});

describe('publication feed', () => {
  it('lists committed transitions with their records and promotable payload hashes', async () => {
    const h = await harness();
    const v1 = record(h.log.vaultId, h.owner);
    h.submit(null, [v1]);
    const bad = {
      ...record(h.log.vaultId, h.owner, { prev: v1 }),
      signature: randomBytes(64),
    };
    expect(h.submit(null, [bad])).toMatchObject({
      ok: false,
      error: 'rejected',
    });
    const out = h.run((e) => e.transitions({ after: 0, limit: 10 }, h.now));
    if (!out.ok) throw new Error(out.error);
    expect(out.revision).toBe(2);
    expect(out.transitions.map((t) => t.revision)).toEqual([1, 2]);
    const [epoch, write] = out.transitions;
    expect(epoch?.entry).toEqual(h.log.entries[0]);
    expect(epoch?.payload_hashes).toHaveLength(1);
    expect(write?.records).toEqual([v1]);
    expect(write?.payload_hashes).toEqual([v1.record.ciphertext_hash]);
    const later = h.run((e) => e.transitions({ after: 2, limit: 10 }, h.now));
    expect(later).toMatchObject({ ok: true, transitions: [] });
  });
});

describe('audit head', () => {
  it('advances only by compare-and-swap with a growing count', async () => {
    const h = await harness();
    const first = randomBytes(32);
    const zero = new Uint8Array(32);
    expect(
      h.run((e) =>
        e.audit(
          { prev_audit_head: zero, audit_head: first, event_count: 3 },
          h.now
        )
      )
    ).toEqual({ ok: true });
    for (const bad of [
      { prev_audit_head: zero, audit_head: randomBytes(32), event_count: 4 },
      { prev_audit_head: first, audit_head: randomBytes(32), event_count: 3 },
      { prev_audit_head: first, audit_head: zero, event_count: 9 },
    ]) {
      expect(h.run((e) => e.audit(bad, h.now))).toMatchObject({
        ok: false,
        error: 'conflict',
      });
    }
    expect(attest(h).attestation.attestation.audit_head).toEqual(first);
  });
});

describe('metering', () => {
  it('refuses calls past the per-minute budget and recovers in the next minute', async () => {
    const h = await harness();
    h.now += 60_000;
    let refused = 0;
    for (let i = 0; i <= LIMITS.perMinute.attest; i++) {
      const out = h.run((e) => e.attest({ nonce: null, proofs: null }, h.now));
      if (!out.ok) refused++;
    }
    expect(refused).toBe(1);
    h.restart();
    expect(
      h.run((e) => e.attest({ nonce: null, proofs: null }, h.now))
    ).toMatchObject({
      ok: false,
      error: 'rate_limited',
    });
    h.now += 60_000;
    expect(
      h.run((e) => e.attest({ nonce: null, proofs: null }, h.now))
    ).toMatchObject({ ok: true });
  });
});

export type { SignedRecord };
