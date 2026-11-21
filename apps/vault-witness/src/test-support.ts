/**
 * Test-only fixtures: an in-memory SQLite runner and signed key logs and
 * records built through the public `@tuturuuu/vault-crypto` API. Not imported
 * by the Worker.
 */
import { DatabaseSync } from 'node:sqlite';
import {
  deriveKemKeyPair,
  type EntryBody,
  type EntryPayload,
  type EpochDescriptor,
  edkId,
  entryHash,
  type GenesisBody,
  genesisHash,
  generateSigningKeyPair,
  randomBytes,
  recordHash,
  type SignedEntry,
  type SignedGenesis,
  type SignedRecord,
  type SigningKeyPair,
  sha256,
  signObject,
  signRecord,
  sortSignatures,
  vaultIdOf,
  type VersionRecord,
} from '@tuturuuu/vault-crypto';
import type { SqlRunner, SqlValue } from './store';

export const DEPLOYMENT = 'test';

export function sqlite() {
  const db = new DatabaseSync(':memory:');
  const sql: SqlRunner = {
    exec(query, ...bindings) {
      const args = bindings.map((b: SqlValue) =>
        b instanceof ArrayBuffer ? new Uint8Array(b) : b
      );
      const statement = db.prepare(query);
      return {
        toArray: () =>
          (/^\s*(SELECT|WITH)/iu.test(query)
            ? statement.all(...(args as never[]))
            : (statement.run(...(args as never[])), [])) as never,
      };
    },
  };
  /** Mirrors `transactionSync`: commit on return, roll back on throw. */
  function tx<T>(fn: () => T): T {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { db, sql, tx };
}

export type Party = {
  readonly user_id: string;
  readonly signing_key: Uint8Array;
  readonly pair: SigningKeyPair;
};

export function party(user_id: string): Party {
  const pair = generateSigningKeyPair();
  return { user_id, signing_key: pair.publicKey, pair };
}

const key = (p: Party) => ({ user_id: p.user_id, signing_key: p.signing_key });

function sign(body: GenesisBody | EntryBody, signers: readonly Party[]) {
  return sortSignatures(
    signers.map((s) => ({
      key: s.signing_key,
      signature: signObject(s.pair.secretKey, 'key-log', body as never),
    }))
  );
}

export function makeGenesis(owners: readonly Party[]): SignedGenesis {
  const body: GenesisBody = {
    deployment: DEPLOYMENT,
    kind: 'genesis',
    nonce: randomBytes(16),
    owners: owners.map(key),
    threshold: 1,
    issued_at: 1000,
  };
  return { body, signatures: sign(body, owners) };
}

export class LogBuilder {
  readonly entries: SignedEntry[] = [];
  get pinned() {
    return { deployment: DEPLOYMENT, vaultId: this.vaultId };
  }
  readonly vaultId: Uint8Array;
  head: Uint8Array;

  constructor(readonly genesis: SignedGenesis) {
    this.vaultId = vaultIdOf(genesis.body);
    this.head = genesisHash(genesis);
  }

  /** Builds the next entry; `commit` advances the builder once it is accepted. */
  next(payload: EntryPayload, signers: readonly Party[]): SignedEntry {
    const body: EntryBody = {
      deployment: DEPLOYMENT,
      vault_id: this.vaultId,
      seq: this.entries.length + 1,
      prev_hash: this.head,
      issued_at: 1000 + this.entries.length + 1,
      payload,
    };
    return { body, signatures: sign(body, signers) };
  }

  commit(entry: SignedEntry) {
    this.entries.push(entry);
    this.head = entryHash(entry);
  }
}

export async function descriptor(
  env: string,
  n: number,
  digest = randomBytes(32)
): Promise<EpochDescriptor> {
  const intake = await deriveKemKeyPair(randomBytes(32));
  const esk = await deriveKemKeyPair(randomBytes(32));
  return {
    env,
    epoch: n,
    edk_id: edkId(randomBytes(32)),
    intake_key: intake.publicKey,
    esk_key: esk.publicKey,
    pin_allowed: false,
    wraps: [
      {
        recipient_fp: randomBytes(32),
        key_kind: 'edk',
        epoch: n,
        digest,
      },
    ],
    history:
      n === 1 ? null : { normal: randomBytes(32), sensitive: randomBytes(32) },
  };
}

export function record(
  vaultId: Uint8Array,
  writer: Party,
  overrides: Partial<VersionRecord> & { prev?: SignedRecord } = {}
): SignedRecord {
  const { prev, ...rest } = overrides;
  return signRecord(writer.pair.secretKey, {
    deployment: DEPLOYMENT,
    vault_id: vaultId,
    env: 'prod',
    variable_id: 'var-1',
    name: 'DATABASE_URL',
    type: 'secret',
    sensitive: false,
    version: prev ? prev.record.version + 1 : 1,
    epoch: 1,
    cipher: 'hpke-intake',
    enc_id: randomBytes(16),
    ciphertext_hash: sha256(randomBytes(16)),
    prev_record_hash: prev ? recordHash(prev) : null,
    auth_seq: 1,
    writer_id: writer.user_id,
    written_at: 2000,
    source: null,
    ...rest,
  });
}

export function signer(generation = 1) {
  const pair = generateSigningKeyPair();
  return { generation, secretKey: pair.secretKey, publicKey: pair.publicKey };
}
