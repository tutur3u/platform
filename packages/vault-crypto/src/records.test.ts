import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { sha256 } from './kdf';
import { verifyKeyLog } from './keylog';
import {
  assertCiphertextHash,
  recordHash,
  type SignedRecord,
  signRecord,
  verifyRecord,
  type VersionRecord,
  type WriterLookup,
} from './records';
import {
  assertLatest,
  assertMatchesKeyLog,
  type Attestation,
  environmentRoot,
  signAttestation,
  sortLeaves,
  verifyAttestation,
} from './snapshot';
import { inclusionProof } from './merkle';
import { snapshotLeafHash } from './snapshot';
import { generateSigningKeyPair } from './signing';
import {
  DEPLOYMENT,
  key,
  LogBuilder,
  makeGenesis,
  party,
} from './test-fixtures';

const owner = party('owner');
const writer = party('writer');
const admin = party('admin');

function log() {
  const l = new LogBuilder(makeGenesis([owner], 1));
  l.append({ kind: 'admin_set', admins: [key(admin)] }, [owner]);
  l.append(
    {
      kind: 'member_role',
      env: 'prod',
      user_id: 'writer',
      role: 'writer',
      signing_key: writer.signing_key,
      encryption_key: new Uint8Array(32),
    },
    [admin]
  );
  l.append(
    {
      kind: 'member_role',
      env: 'prod',
      user_id: 'writer',
      role: 'viewer',
      signing_key: writer.signing_key,
      encryption_key: new Uint8Array(32),
    },
    [admin]
  );
  return l;
}

function lookupFor(l: LogBuilder): WriterLookup {
  const state = verifyKeyLog(l.genesis, l.entries, l.pinned);
  const admins = new Map([[admin.user_id, admin.signing_key]]);
  return (id, env, seq) => {
    if (admins.has(id)) return { signingKey: admins.get(id)!, canWrite: true };
    const role = state.roleAt(env, id, seq);
    return role
      ? {
          signingKey: role.signingKey,
          canWrite: ['writer', 'editor', 'admin'].includes(role.role),
        }
      : null;
  };
}

function baseRecord(
  l: LogBuilder,
  overrides: Partial<VersionRecord> = {}
): VersionRecord {
  const ct = randomBytes(40);
  return {
    deployment: DEPLOYMENT,
    vault_id: l.vaultId,
    env: 'prod',
    variable_id: 'var-1',
    name: 'DATABASE_URL',
    type: 'secret',
    sensitive: false,
    version: 1,
    epoch: 1,
    cipher: 'hpke-intake',
    enc_id: randomBytes(16),
    ciphertext_hash: sha256(ct),
    prev_record_hash: null,
    auth_seq: 2,
    writer_id: 'writer',
    written_at: 2000,
    source: null,
    ...overrides,
  };
}

describe('version records', () => {
  it('accepts a writer authorised at auth_seq even after a later downgrade', () => {
    const l = log();
    const signed = signRecord(writer.pair.secretKey, baseRecord(l));
    expect(() => verifyRecord(signed, lookupFor(l))).not.toThrow();
  });

  it('rejects a writer who was not authorised at auth_seq, or a tampered field', () => {
    const l = log();
    expect(() =>
      verifyRecord(
        signRecord(writer.pair.secretKey, baseRecord(l, { auth_seq: 3 })),
        lookupFor(l)
      )
    ).toThrow(/authorised/);
    const signed = signRecord(writer.pair.secretKey, baseRecord(l));
    expect(() =>
      verifyRecord(
        { ...signed, record: { ...signed.record, name: 'OTHER' } },
        lookupFor(l)
      )
    ).toThrow();
    expect(() =>
      verifyRecord(
        {
          ...signed,
          record: { ...signed.record, sensitive: true, cipher: 'hpke-esk' },
        },
        lookupFor(l)
      )
    ).toThrow();
  });

  it('enforces cipher, sensitivity and chain structure', () => {
    const l = log();
    expect(() =>
      signRecord(writer.pair.secretKey, baseRecord(l, { sensitive: true }))
    ).toThrow(/ESK/);
    expect(() =>
      signRecord(writer.pair.secretKey, baseRecord(l, { version: 2 }))
    ).toThrow(/previous/);
    expect(() =>
      signRecord(writer.pair.secretKey, baseRecord(l, { cipher: 'tombstone' }))
    ).toThrow();
    expect(() =>
      signRecord(
        writer.pair.secretKey,
        baseRecord(l, {
          cipher: 'tombstone',
          enc_id: null,
          ciphertext_hash: null,
        })
      )
    ).not.toThrow();
  });

  it('verifies re-encryption provenance through both signatures', () => {
    const l = log();
    const original = signRecord(writer.pair.secretKey, baseRecord(l));
    const reenc = (o: SignedRecord, extra: Partial<VersionRecord> = {}) =>
      signRecord(
        admin.pair.secretKey,
        baseRecord(l, {
          version: 2,
          epoch: 2,
          prev_record_hash: recordHash(o),
          writer_id: 'admin',
          auth_seq: 3,
          source: {
            record_hash: recordHash(o),
            writer_id: 'writer',
            signature: o.signature,
            plaintext_unchanged: true,
          },
          ...extra,
        })
      );
    expect(() =>
      verifyRecord(reenc(original), lookupFor(l), original)
    ).not.toThrow();
    expect(() => verifyRecord(reenc(original), lookupFor(l))).toThrow(/source/);
    const other = signRecord(
      writer.pair.secretKey,
      baseRecord(l, { variable_id: 'var-2' })
    );
    expect(() => verifyRecord(reenc(original), lookupFor(l), other)).toThrow(
      /source/
    );
    expect(() =>
      verifyRecord(reenc(original, { epoch: 1 }), lookupFor(l), original)
    ).toThrow(/source/);
  });

  it('checks ciphertext against its record', () => {
    const ct = randomBytes(10);
    const r = baseRecord(log(), { ciphertext_hash: sha256(ct) });
    expect(() => assertCiphertextHash(r, ct)).not.toThrow();
    expect(() => assertCiphertextHash(r, randomBytes(10))).toThrow();
  });
});

describe('witness attestations', () => {
  const witness = generateSigningKeyPair();

  function attested(
    l: LogBuilder,
    heads: { variable_id: string; head: Uint8Array }[],
    overrides: Partial<Attestation> = {}
  ) {
    const scope = { deployment: DEPLOYMENT, vault_id: l.vaultId };
    const state = verifyKeyLog(l.genesis, l.entries, l.pinned);
    const leaves = heads.map((h) => ({ env: 'prod', ...h }));
    const att: Attestation = {
      ...scope,
      witness_generation: 1,
      seq: state.headSeq,
      key_log_head: state.headHash,
      env_roots: [environmentRoot(scope, leaves)],
      audit_head: new Uint8Array(32),
      issued_at: 5000,
      ...overrides,
    };
    return {
      scope,
      state,
      leaves: sortLeaves(leaves),
      signed: signAttestation(witness.secretKey, att),
    };
  }

  const options = (
    scope: { deployment: string; vault_id: Uint8Array },
    extra = {}
  ) => ({
    scope,
    witnessKeys: new Map([[1, witness.publicKey]]),
    now: 5100,
    floorSeq: 0,
    ...extra,
  });

  it('accepts the current head and rejects a superseded value', () => {
    const l = log();
    const v1 = randomBytes(32);
    const v2 = randomBytes(32);
    const { scope, state, leaves, signed } = attested(l, [
      { variable_id: 'var-1', head: v2 },
      { variable_id: 'var-0', head: randomBytes(32) },
    ]);
    const a = verifyAttestation(signed, options(scope));
    assertMatchesKeyLog(a, state);
    const index = leaves.findIndex((x) => x.variable_id === 'var-1');
    const path = inclusionProof(
      leaves.map((x) => snapshotLeafHash(scope, x)),
      index
    );
    expect(() =>
      assertLatest(
        a,
        { env: 'prod', variable_id: 'var-1', head: v2 },
        { index, path }
      )
    ).not.toThrow();
    expect(() =>
      assertLatest(
        a,
        { env: 'prod', variable_id: 'var-1', head: v1 },
        { index, path }
      )
    ).toThrow(/latest/);
    expect(() =>
      assertLatest(
        a,
        { env: 'staging', variable_id: 'var-1', head: v2 },
        { index, path }
      )
    ).toThrow();
  });

  it('rejects stale, future, unknown-generation, other-vault and behind-floor attestations', () => {
    const l = log();
    const { scope, signed } = attested(l, []);
    expect(() =>
      verifyAttestation(signed, options(scope, { now: 5000 + 601 }))
    ).toThrow(/Stale/);
    expect(() =>
      verifyAttestation(signed, options(scope, { now: 5000 - 61 }))
    ).toThrow(/Stale/);
    expect(() =>
      verifyAttestation(
        signed,
        options(scope, { witnessKeys: new Map([[2, witness.publicKey]]) })
      )
    ).toThrow(/generation/);
    expect(() =>
      verifyAttestation(
        signed,
        options({ ...scope, vault_id: randomBytes(32) })
      )
    ).toThrow(/another vault/);
    expect(() =>
      verifyAttestation(signed, options(scope, { floorSeq: 99 }))
    ).toThrow(/floor/);
    const forged = {
      ...signed,
      attestation: { ...signed.attestation, seq: 1 },
    };
    expect(() => verifyAttestation(forged, options(scope))).toThrow();
  });

  it('rejects an attestation for a different key-log head', () => {
    const l = log();
    const { scope, state, signed } = attested(l, [], {
      key_log_head: randomBytes(32),
    });
    const a = verifyAttestation(signed, options(scope));
    expect(() => assertMatchesKeyLog(a, state)).toThrow(/key log/);
  });

  it('refuses duplicate variables in one environment root', () => {
    const scope = { deployment: DEPLOYMENT, vault_id: new Uint8Array(32) };
    const head = new Uint8Array(32);
    expect(() =>
      environmentRoot(scope, [
        { env: 'prod', variable_id: 'a', head },
        { env: 'prod', variable_id: 'a', head },
      ])
    ).toThrow();
  });
});
