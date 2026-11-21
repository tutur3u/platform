import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { sha256 } from './kdf';
import { verifyKeyLog } from './keylog';
import { inclusionProof } from './merkle';
import {
  recordHash,
  type SignedRecord,
  signRecord,
  type VersionRecord,
} from './records';
import { generateSigningKeyPair } from './signing';
import {
  assertLatestRecord,
  assertMatchesKeyLog,
  type Attestation,
  environmentRoot,
  signAttestation,
  snapshotLeafHash,
  sortLeaves,
  verifyAttestation,
} from './snapshot';
import { DEPLOYMENT, LogBuilder, makeGenesis, party } from './test-fixtures';

const owner = party('owner');
const witness = generateSigningKeyPair();
const l = new LogBuilder(makeGenesis([owner], 1));
const state = verifyKeyLog(l.genesis, l.entries, l.pinned);
const scope = { deployment: DEPLOYMENT, vault_id: l.vaultId };

function record(
  variable_id: string,
  extra: Partial<VersionRecord> = {}
): SignedRecord {
  return signRecord(owner.pair.secretKey, {
    ...scope,
    env: 'prod',
    variable_id,
    name: 'API_KEY',
    type: 'secret',
    sensitive: false,
    version: 1,
    epoch: 1,
    cipher: 'aead-edk',
    enc_id: randomBytes(16),
    ciphertext_hash: sha256(randomBytes(4)),
    prev_record_hash: null,
    auth_seq: 0,
    writer_id: 'owner',
    written_at: 1,
    source: null,
    ...extra,
  });
}

function attest(records: SignedRecord[], extra: Partial<Attestation> = {}) {
  const leaves = sortLeaves(
    records.map((r) => ({
      env: 'prod',
      variable_id: r.record.variable_id,
      head: recordHash(r),
    }))
  );
  const att: Attestation = {
    ...scope,
    witness_generation: 2,
    revision: 10,
    seq: state.headSeq,
    key_log_head: state.headHash,
    env_roots: [environmentRoot(scope, 'prod', leaves)],
    audit_head: new Uint8Array(32),
    issued_at: 5000,
    request_nonce: null,
    ...extra,
  };
  const proofFor = (r: SignedRecord) => {
    const index = leaves.findIndex(
      (x) => x.variable_id === r.record.variable_id
    );
    return {
      index,
      path: inclusionProof(
        leaves.map((x) => snapshotLeafHash(scope, x)),
        index
      ),
    };
  };
  return { signed: signAttestation(witness.secretKey, att), proofFor };
}

const options = (extra = {}) => ({
  scope,
  witnessKeys: new Map([
    [1, generateSigningKeyPair().publicKey],
    [2, witness.publicKey],
  ]),
  minGeneration: 2,
  now: 5100,
  floorSeq: 0,
  floorRevision: 0,
  ...extra,
});

describe('witness attestations', () => {
  it('accepts the latest record and rejects superseded, tombstoned and cross-vault values', () => {
    const v1 = record('var-1');
    const v2 = record('var-1', {
      version: 2,
      prev_record_hash: recordHash(v1),
    });
    const tomb = record('var-2', {
      cipher: 'tombstone',
      enc_id: null,
      ciphertext_hash: null,
    });
    const { signed, proofFor } = attest([v2, tomb, record('var-0')]);
    const a = verifyAttestation(signed, options());
    assertMatchesKeyLog(a, state);
    expect(() => assertLatestRecord(a, v2, proofFor(v2))).not.toThrow();
    expect(() => assertLatestRecord(a, v1, proofFor(v2))).toThrow(/latest/);
    expect(() => assertLatestRecord(a, tomb, proofFor(tomb))).toThrow(
      /deleted/
    );
    const elsewhere = record('var-1', { vault_id: randomBytes(32) });
    expect(() => assertLatestRecord(a, elsewhere, proofFor(v2))).toThrow(
      /another vault/
    );
  });

  it('rejects stale, future, retired, unknown, other-vault and behind-floor attestations', () => {
    const { signed } = attest([]);
    expect(() => verifyAttestation(signed, options({ now: 5601 }))).toThrow(
      /Stale/
    );
    expect(() => verifyAttestation(signed, options({ now: 4939 }))).toThrow(
      /Stale/
    );
    expect(() =>
      verifyAttestation(signed, options({ minGeneration: 3 }))
    ).toThrow(/Retired/);
    expect(() =>
      verifyAttestation(signed, options({ witnessKeys: new Map() }))
    ).toThrow(/Unknown/);
    expect(() =>
      verifyAttestation(
        signed,
        options({ scope: { ...scope, vault_id: randomBytes(32) } })
      )
    ).toThrow(/another vault/);
    expect(() => verifyAttestation(signed, options({ floorSeq: 1 }))).toThrow(
      /floor/
    );
    expect(() =>
      verifyAttestation(signed, options({ floorRevision: 11 }))
    ).toThrow(/floor/);
    const forged = {
      ...signed,
      attestation: { ...signed.attestation, revision: 11 },
    };
    expect(() => verifyAttestation(forged, options())).toThrow();
  });

  it('binds a fresh request nonce when the client sends one', () => {
    const nonce = randomBytes(16);
    expect(() =>
      verifyAttestation(
        attest([], { request_nonce: nonce }).signed,
        options({ expectedNonce: nonce })
      )
    ).not.toThrow();
    expect(() =>
      verifyAttestation(attest([]).signed, options({ expectedNonce: nonce }))
    ).toThrow(/request/);
    expect(() =>
      verifyAttestation(
        attest([], { request_nonce: randomBytes(16) }).signed,
        options({ expectedNonce: nonce })
      )
    ).toThrow(/request/);
  });

  it('rejects an attestation for another key-log head or a malformed shape', () => {
    const { signed } = attest([], { key_log_head: randomBytes(32) });
    expect(() =>
      assertMatchesKeyLog(verifyAttestation(signed, options()), state)
    ).toThrow(/key log/);
    const { revision: _drop, ...noRevision } = signed.attestation;
    expect(() =>
      verifyAttestation({ ...signed, attestation: noRevision }, options())
    ).toThrow(/Malformed/);
  });

  it('refuses duplicate variables and mixed environments in one root', () => {
    const head = new Uint8Array(32);
    expect(() =>
      environmentRoot(scope, 'prod', [
        { env: 'prod', variable_id: 'a', head },
        { env: 'prod', variable_id: 'a', head },
      ])
    ).toThrow();
    expect(() =>
      environmentRoot(scope, 'prod', [{ env: 'dev', variable_id: 'a', head }])
    ).toThrow();
  });
});
