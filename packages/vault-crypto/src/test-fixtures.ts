import {
  type EntryBody,
  type EntryPayload,
  type EpochDescriptor,
  entryHash,
  type GenesisBody,
  genesisHash,
  type PartyKey,
  type SignedEntry,
  type SignedGenesis,
  sortSignatures,
  vaultIdOf,
} from './keylog';
import { utf8 } from './bytes';
import { sha256 } from './kdf';
import {
  generateSigningKeyPair,
  type SigningKeyPair,
  signObject,
} from './signing';

/** Test-only builder for signed key logs. Not exported from the package. */
export type Party = PartyKey & { readonly pair: SigningKeyPair };

export function party(user_id: string): Party {
  const pair = generateSigningKeyPair();
  return { user_id, signing_key: pair.publicKey, pair };
}

export const DEPLOYMENT = 'test';

export function key(p: Party): PartyKey {
  return { user_id: p.user_id, signing_key: p.signing_key };
}

function sign(body: GenesisBody | EntryBody, signers: readonly Party[]) {
  return sortSignatures(
    signers.map((s) => ({
      key: s.signing_key,
      signature: signObject(
        s.pair.secretKey,
        'key-log',
        body as unknown as Parameters<typeof signObject>[2]
      ),
    }))
  );
}

export function makeGenesis(
  owners: readonly Party[],
  threshold: number,
  signers = owners
): SignedGenesis {
  const body: GenesisBody = {
    deployment: DEPLOYMENT,
    kind: 'genesis',
    nonce: new Uint8Array(16).fill(9),
    owners: owners.map(key),
    threshold,
    issued_at: 1000,
  };
  return { body, signatures: sign(body, signers) };
}

export class LogBuilder {
  readonly entries: SignedEntry[] = [];
  readonly vaultId: Uint8Array;
  private head: Uint8Array;

  constructor(readonly genesis: SignedGenesis) {
    this.vaultId = vaultIdOf(genesis.body);
    this.head = genesisHash(genesis);
  }

  append(
    payload: EntryPayload,
    signers: readonly Party[],
    overrides: Partial<EntryBody> = {}
  ): SignedEntry {
    const body: EntryBody = {
      deployment: DEPLOYMENT,
      vault_id: this.vaultId,
      seq: this.entries.length + 1,
      prev_hash: this.head,
      issued_at: 1000 + this.entries.length + 1,
      payload,
      ...overrides,
    };
    const entry = { body, signatures: sign(body, signers) };
    this.entries.push(entry);
    this.head = entryHash(entry);
    return entry;
  }

  get pinned() {
    return { deployment: DEPLOYMENT, vaultId: this.vaultId };
  }
}

const fresh = (env: string, n: number, label: string, length: number) =>
  sha256(utf8(`${env}/${n}/${label}`)).slice(0, length);

/** Epoch descriptors with distinct key material per environment and epoch. */
export function descriptor(
  env: string,
  n: number,
  fps: number[] = [1]
): EpochDescriptor {
  return {
    env,
    epoch: n,
    edk_id: fresh(env, n, 'edk', 16),
    intake_key: fresh(env, n, 'intake', 32),
    esk_key: fresh(env, n, 'esk', 32),
    pin_allowed: false,
    wraps: fps.map((f) => ({
      recipient_fp: new Uint8Array(32).fill(f),
      key_kind: 'edk' as const,
      epoch: n,
      digest: new Uint8Array(32).fill(f + 10),
    })),
    history:
      n === 1
        ? null
        : {
            normal: fresh(env, n, 'hn', 32),
            sensitive: fresh(env, n, 'hs', 32),
          },
  };
}
