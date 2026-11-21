import { randomBytes, recordHash } from '@tuturuuu/vault-crypto';
import { describe, expect, it } from 'vite-plus/test';
import { harness } from './harness';
import { CHALLENGE_TTL_MS } from './vault-engine';
import { CAPS } from './vault-state';
import { descriptor, party, record } from './test-support';

const revision = (h: Awaited<ReturnType<typeof harness>>) => {
  const out = h.run((e) => e.transitions({ after: 0, limit: 100 }, h.now));
  if (!out.ok) throw new Error(out.error);
  return out.revision;
};

describe('witness admission', () => {
  it('consumes each challenge once, even when the transition is rejected', async () => {
    const h = await harness();
    const challenge = h.challenge();
    const bad = {
      ...record(h.log.vaultId, h.owner),
      signature: randomBytes(64),
    };
    const submit = (records: ReturnType<typeof record>[]) =>
      h.run((e) =>
        e.append({ challenge, base: h.base(), entry: null, records }, h.now)
      );
    expect(submit([bad])).toMatchObject({ ok: false, error: 'rejected' });
    expect(submit([record(h.log.vaultId, h.owner)])).toMatchObject({
      ok: false,
      error: 'challenge_invalid',
    });
  });

  it('refuses expired and unknown challenges', async () => {
    const h = await harness();
    const challenge = h.challenge();
    h.now += CHALLENGE_TTL_MS;
    const append = (c: Uint8Array) =>
      h.run((e) =>
        e.append(
          {
            challenge: c,
            base: h.base(),
            entry: null,
            records: [record(h.log.vaultId, h.owner)],
          },
          h.now
        )
      );
    expect(append(challenge)).toMatchObject({ error: 'challenge_invalid' });
    expect(append(randomBytes(16))).toMatchObject({
      error: 'challenge_invalid',
    });
  });

  it('refuses a submission that does not name the current head or generation', async () => {
    const h = await harness();
    const v1 = record(h.log.vaultId, h.owner);
    for (const base of [
      { ...h.base(), seq: 0 },
      { ...h.base(), key_log_head: randomBytes(32) },
      { ...h.base(), witness_generation: 2 },
    ]) {
      expect(h.submit(null, [v1], base)).toMatchObject({
        ok: false,
        error: 'stale_head',
      });
    }
    expect(revision(h)).toBe(1);
  });

  it('makes a writer reseal after an epoch change', async () => {
    const h = await harness();
    const staleBase = h.base();
    const epoch2 = h.log.next(
      { kind: 'epoch', descriptor: await descriptor('prod', 2) },
      [h.owner]
    );
    expect(h.submit(epoch2)).toMatchObject({ ok: true, seq: 2 });
    const sealedForEpoch1 = record(h.log.vaultId, h.owner);
    expect(h.submit(null, [sealedForEpoch1], staleBase)).toMatchObject({
      error: 'stale_head',
    });
    expect(h.submit(null, [sealedForEpoch1])).toMatchObject({
      ok: false,
      error: 'rejected',
    });
    const resealed = record(h.log.vaultId, h.owner, { epoch: 2, auth_seq: 2 });
    expect(h.submit(null, [resealed])).toMatchObject({ ok: true });
  });

  it('refuses a writer whose authority was revoked after auth_seq', async () => {
    const h = await harness();
    const dave = party('dave');
    // Member entries need a canonical X25519 key; derive one from a descriptor.
    const kem = (await descriptor('prod', 9)).intake_key;
    const member = (r: 'writer' | 'viewer') =>
      h.log.next(
        {
          kind: 'member_role',
          env: 'prod',
          user_id: 'dave',
          role: r,
          signing_key: dave.signing_key,
          encryption_key: kem,
          next_epochs: [],
        },
        [h.owner]
      );
    expect(h.submit(member('writer'))).toMatchObject({ ok: true, seq: 2 });
    expect(h.submit(member('viewer'))).toMatchObject({ ok: true, seq: 3 });
    const signedWhileWriter = record(h.log.vaultId, dave, { auth_seq: 2 });
    expect(h.submit(null, [signedWhileWriter])).toMatchObject({
      ok: false,
      error: 'rejected',
      message: expect.stringMatching(/revoked/),
    });
  });
});

describe('atomic transitions', () => {
  it('applies every record of a transition or none', async () => {
    const h = await harness();
    const a = record(h.log.vaultId, h.owner, { variable_id: 'a' });
    const b = {
      ...record(h.log.vaultId, h.owner, { variable_id: 'b' }),
      signature: randomBytes(64),
    };
    expect(h.submit(null, [a, b])).toMatchObject({
      ok: false,
      error: 'rejected',
    });
    expect(revision(h)).toBe(1);
    const c = record(h.log.vaultId, h.owner, { variable_id: 'c' });
    expect(h.submit(null, [a, c])).toMatchObject({ ok: true, revision: 2 });
  });

  it('commits an epoch entry with the re-encrypted records that depend on it', async () => {
    const h = await harness();
    const v1 = record(h.log.vaultId, h.owner);
    expect(h.submit(null, [v1])).toMatchObject({ ok: true });
    const epoch2 = h.log.next(
      { kind: 'epoch', descriptor: await descriptor('prod', 2) },
      [h.owner]
    );
    const reencrypted = record(h.log.vaultId, h.owner, {
      prev: v1,
      epoch: 2,
      auth_seq: 2,
      cipher: 'hpke-esk',
      sensitive: true,
      source: {
        record_hash: recordHash(v1),
        writer_id: 'owner',
        signature: v1.signature,
        plaintext_unchanged: true,
        sensitivity_change: true,
      },
    });
    const result = h.submit(epoch2, [reencrypted]);
    expect(result).toMatchObject({ ok: true, seq: 2, revision: 3 });
    if (!result.ok) return;
    expect(result.payload_hashes).toContainEqual(
      reencrypted.record.ciphertext_hash
    );
    const payload = epoch2.body.payload;
    if (payload.kind !== 'epoch') throw new Error('expected an epoch entry');
    expect(result.payload_hashes).toContainEqual(
      payload.descriptor.wraps[0]?.digest
    );
  });

  it('refuses naming one variable twice and oversized transitions', async () => {
    const h = await harness();
    const v1 = record(h.log.vaultId, h.owner);
    const v2 = record(h.log.vaultId, h.owner, { prev: v1 });
    expect(h.submit(null, [v1, v2])).toMatchObject({
      ok: false,
      message: 'Variable named twice',
    });
    const many = Array.from({ length: CAPS.recordsPerTransition + 1 }, (_, i) =>
      record(h.log.vaultId, h.owner, { variable_id: `v${i}` })
    );
    expect(h.submit(null, many)).toMatchObject({ ok: false, error: 'limit' });
  });

  it('rejects malformed records without failing the call', async () => {
    const h = await harness();
    expect(h.submit(null, [{ nope: true } as never])).toMatchObject({
      ok: false,
      error: 'rejected',
    });
    expect(
      h.submit(null, [
        { record: { env: 'prod' }, signature: randomBytes(64) } as never,
      ])
    ).toMatchObject({
      ok: false,
      error: 'rejected',
    });
  });
});
