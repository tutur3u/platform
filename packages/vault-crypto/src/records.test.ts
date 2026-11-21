import { describe, expect, it } from 'vitest';
import { randomBytes, toHex } from './bytes';
import { sha256 } from './kdf';
import { verifyKeyLog } from './keylog';
import {
  assertCiphertextHash,
  recordHash,
  type SignedRecord,
  signRecord,
  verifyAppend,
  verifyRecord,
  type VersionRecord,
} from './records';
import {
  descriptor,
  DEPLOYMENT,
  LogBuilder,
  makeGenesis,
  party,
} from './test-fixtures';

const owner = party('owner');
const writer = party('writer');
const envAdmin = party('env-admin');

const role = (
  user: ReturnType<typeof party>,
  r: 'writer' | 'viewer' | 'admin',
  next = [] as ReturnType<typeof descriptor>[]
) => ({
  kind: 'member_role' as const,
  env: 'prod',
  user_id: user.user_id,
  role: r,
  signing_key: user.signing_key,
  encryption_key: new Uint8Array(32),
  next_epochs: next,
});

/** seq 1 epoch 1; 2 writer=writer; 3 env-admin=admin; 4 writer=viewer; 5 epoch 2. */
function log() {
  const l = new LogBuilder(makeGenesis([owner], 1));
  l.append({ kind: 'epoch', descriptor: descriptor('prod', 1) }, [owner]);
  l.append(role(writer, 'writer'), [owner]);
  l.append(role(envAdmin, 'admin'), [owner]);
  l.append(role(writer, 'viewer'), [owner]);
  l.append({ kind: 'epoch', descriptor: descriptor('prod', 2) }, [owner]);
  return { l, state: verifyKeyLog(l.genesis, l.entries, l.pinned) };
}

function rec(
  l: LogBuilder,
  overrides: Partial<VersionRecord> = {}
): VersionRecord {
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
    ciphertext_hash: sha256(randomBytes(8)),
    prev_record_hash: null,
    auth_seq: 2,
    writer_id: 'writer',
    written_at: 2000,
    source: null,
    ...overrides,
  };
}

function reencrypt(
  l: LogBuilder,
  signer: ReturnType<typeof party>,
  o: SignedRecord,
  extra: Partial<VersionRecord> = {}
) {
  return signRecord(
    signer.pair.secretKey,
    rec(l, {
      version: o.record.version + 1,
      epoch: o.record.epoch + 1,
      prev_record_hash: recordHash(o),
      writer_id: signer.user_id,
      auth_seq: 5,
      source: {
        record_hash: recordHash(o),
        writer_id: o.record.writer_id,
        signature: o.signature,
        plaintext_unchanged: true,
      },
      ...extra,
    })
  );
}

const ancestry = (...records: SignedRecord[]) =>
  new Map(records.map((r) => [toHex(recordHash(r)), r]));

describe('historical record verification', () => {
  it('accepts a writer authorised at auth_seq even after a later downgrade', () => {
    const { l, state } = log();
    expect(() =>
      verifyRecord(signRecord(writer.pair.secretKey, rec(l)), state)
    ).not.toThrow();
  });

  it('rejects unauthorised writers, tampering, other vaults and sequences beyond the head', () => {
    const { l, state } = log();
    expect(() =>
      verifyRecord(
        signRecord(writer.pair.secretKey, rec(l, { auth_seq: 4 })),
        state
      )
    ).toThrow(/authorised/);
    expect(() =>
      verifyRecord(
        signRecord(writer.pair.secretKey, rec(l, { auth_seq: 99 })),
        state
      )
    ).toThrow(/beyond/);
    const signed = signRecord(writer.pair.secretKey, rec(l));
    expect(() =>
      verifyRecord(
        { ...signed, record: { ...signed.record, name: 'OTHER' } },
        state
      )
    ).toThrow();
    expect(() =>
      verifyRecord(
        signRecord(
          writer.pair.secretKey,
          rec(l, { vault_id: randomBytes(32) })
        ),
        state
      )
    ).toThrow(/another vault/);
    const { source: _drop, ...missing } = signed.record;
    expect(() =>
      verifyRecord({ ...signed, record: missing as VersionRecord }, state)
    ).toThrow(/Malformed/);
  });

  it('enforces cipher, sensitivity and chain structure', () => {
    const { l } = log();
    expect(() =>
      signRecord(writer.pair.secretKey, rec(l, { sensitive: true }))
    ).toThrow(/ESK/);
    expect(() =>
      signRecord(writer.pair.secretKey, rec(l, { version: 2 }))
    ).toThrow(/previous/);
    expect(() =>
      signRecord(writer.pair.secretKey, rec(l, { cipher: 'tombstone' }))
    ).toThrow();
    expect(() =>
      signRecord(
        writer.pair.secretKey,
        rec(l, { cipher: 'tombstone', enc_id: null, ciphertext_hash: null })
      )
    ).not.toThrow();
  });
});

describe('re-encryption provenance', () => {
  it('accepts admin attestations through a chain of ancestors', () => {
    const { l, state } = log();
    const original = signRecord(writer.pair.secretKey, rec(l));
    const first = reencrypt(l, envAdmin, original);
    expect(() => verifyRecord(first, state, ancestry(original))).not.toThrow();
    const second = reencrypt(l, owner, first, { epoch: 3, auth_seq: 5 });
    expect(() =>
      verifyRecord(second, state, ancestry(original, first))
    ).not.toThrow();
    expect(() => verifyRecord(second, state, ancestry(first))).toThrow(
      /missing/
    );
  });

  it('rejects attestations by ordinary writers', () => {
    const { l, state } = log();
    const original = signRecord(writer.pair.secretKey, rec(l));
    const byWriter = reencrypt(l, writer, original, { auth_seq: 2 });
    expect(() => verifyRecord(byWriter, state, ancestry(original))).toThrow(
      /authorised/
    );
  });

  it('rejects tombstone, other-vault and mismatched sources', () => {
    const { l, state } = log();
    const tomb = signRecord(
      writer.pair.secretKey,
      rec(l, { cipher: 'tombstone', enc_id: null, ciphertext_hash: null })
    );
    expect(() =>
      verifyRecord(reencrypt(l, envAdmin, tomb), state, ancestry(tomb))
    ).toThrow(/mismatch/);
    const original = signRecord(writer.pair.secretKey, rec(l));
    expect(() =>
      verifyRecord(
        reencrypt(l, envAdmin, original, { variable_id: 'var-2' }),
        state,
        ancestry(original)
      )
    ).toThrow(/mismatch/);
    expect(() =>
      verifyRecord(
        reencrypt(l, envAdmin, original, { epoch: 1 }),
        state,
        ancestry(original)
      )
    ).toThrow(/mismatch/);
  });
});

describe('append validation', () => {
  it('requires current authority, the current epoch and an exact extension of the head', () => {
    const { l, state } = log();
    const head = signRecord(
      owner.pair.secretKey,
      rec(l, { writer_id: 'owner', epoch: 2, auth_seq: 5 })
    );
    expect(() => verifyAppend(head, state, null)).not.toThrow();
    const next = (extra: Partial<VersionRecord>) =>
      signRecord(
        owner.pair.secretKey,
        rec(l, {
          writer_id: 'owner',
          epoch: 2,
          auth_seq: 5,
          version: 2,
          prev_record_hash: recordHash(head),
          ...extra,
        })
      );
    expect(() => verifyAppend(next({}), state, head)).not.toThrow();
    expect(() =>
      verifyAppend(next({ prev_record_hash: randomBytes(32) }), state, head)
    ).toThrow(/extend/);
    expect(() => verifyAppend(next({ version: 3 }), state, head)).toThrow(
      /extend/
    );
    expect(() => verifyAppend(next({ epoch: 1 }), state, head)).toThrow(
      /current epoch/
    );
    expect(() =>
      verifyAppend(signRecord(writer.pair.secretKey, rec(l)), state, null)
    ).toThrow(/revoked/);
  });
});

it('checks ciphertext against its record', () => {
  const ct = randomBytes(10);
  const r = rec(log().l, { ciphertext_hash: sha256(ct) });
  expect(() => assertCiphertextHash(r, ct)).not.toThrow();
  expect(() => assertCiphertextHash(r, randomBytes(10))).toThrow();
});
