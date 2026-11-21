import { equalBytes, toHex } from './bytes';
import type { CanonicalObject } from './canonical';
import { contextBytes } from './context';
import { VaultCryptoError } from './errors';
import { sha256 } from './kdf';
import { verifyObject } from './signing';

export type PartyKey = {
  readonly user_id: string;
  readonly signing_key: Uint8Array;
};

/** The genesis body; its hash is the `vault_id`, so it cannot contain it. */
export type GenesisBody = {
  readonly deployment: string;
  readonly kind: 'genesis';
  readonly nonce: Uint8Array;
  readonly owners: readonly PartyKey[];
  readonly threshold: number;
  readonly issued_at: number;
};

export const ROLES = [
  'none',
  'viewer',
  'writer',
  'reader',
  'editor',
  'admin',
] as const;
export type Role = (typeof ROLES)[number];

export type WrapDigest = {
  readonly recipient_fp: Uint8Array;
  readonly key_kind: string;
  readonly epoch: number;
  readonly digest: Uint8Array;
};

export type EntryPayload =
  | {
      readonly kind: 'owner_set';
      readonly owners: readonly PartyKey[];
      readonly threshold: number;
    }
  | { readonly kind: 'admin_set'; readonly admins: readonly PartyKey[] }
  | {
      readonly kind: 'member_role';
      readonly env: string;
      readonly user_id: string;
      readonly role: Role;
      readonly signing_key: Uint8Array;
      readonly encryption_key: Uint8Array;
    }
  | {
      readonly kind: 'epoch';
      readonly env: string;
      readonly epoch: number;
      readonly intake_key: Uint8Array;
      readonly esk_key: Uint8Array;
      readonly pin_allowed: boolean;
      readonly wraps: readonly WrapDigest[];
    }
  | {
      readonly kind: 'wrap_addition';
      readonly env: string;
      readonly epoch: number;
      readonly wraps: readonly WrapDigest[];
    };

export type EntryBody = {
  readonly deployment: string;
  readonly vault_id: Uint8Array;
  readonly seq: number;
  readonly prev_hash: Uint8Array;
  readonly issued_at: number;
  readonly payload: EntryPayload;
};

export type EntrySignature = {
  readonly key: Uint8Array;
  readonly signature: Uint8Array;
};

export type SignedGenesis = {
  readonly body: GenesisBody;
  readonly signatures: readonly EntrySignature[];
};
export type SignedEntry = {
  readonly body: EntryBody;
  readonly signatures: readonly EntrySignature[];
};

/** These are plain data objects; encodeCanonical validates them at runtime. */
function plain(value: object): CanonicalObject {
  return value as CanonicalObject;
}

export function vaultIdOf(genesis: GenesisBody): Uint8Array {
  return sha256(contextBytes('genesis', plain(genesis)));
}

export function genesisHash(signed: SignedGenesis): Uint8Array {
  return sha256(contextBytes('entry-hash', plain(signed)));
}

export function entryHash(signed: SignedEntry): Uint8Array {
  return sha256(contextBytes('entry-hash', plain(signed)));
}

export function bodyBytesObject(
  body: GenesisBody | EntryBody
): CanonicalObject {
  return plain(body);
}

type RoleChange = {
  readonly seq: number;
  readonly role: Role;
  readonly signingKey: Uint8Array;
};

export type EnvironmentEpoch = {
  readonly epoch: number;
  readonly seq: number;
  readonly intakeKey: Uint8Array;
  readonly eskKey: Uint8Array;
  readonly pinAllowed: boolean;
  readonly wraps: Map<string, Uint8Array>;
};

export type KeyLogState = {
  readonly vaultId: Uint8Array;
  readonly headSeq: number;
  readonly headHash: Uint8Array;
  readonly owners: readonly PartyKey[];
  readonly threshold: number;
  readonly admins: readonly PartyKey[];
  readonly roleAt: (
    env: string,
    userId: string,
    seq: number
  ) => RoleChange | null;
  readonly epochOf: (env: string) => EnvironmentEpoch | null;
};

const WRITING_ROLES: readonly Role[] = ['writer', 'editor', 'admin'];

export function canWrite(role: Role): boolean {
  return WRITING_ROLES.includes(role);
}

export function wrapKey(
  w: Pick<WrapDigest, 'recipient_fp' | 'key_kind' | 'epoch'>
): string {
  return `${toHex(w.recipient_fp)}:${w.key_kind}:${w.epoch}`;
}

function fail(message: string): never {
  throw new VaultCryptoError('bad_signature', message);
}

/** Counts distinct authorised keys with a valid signature over `body`. */
function countSigners(
  body: GenesisBody | EntryBody,
  signatures: readonly EntrySignature[],
  authorised: readonly PartyKey[]
): number {
  const object = plain(body);
  const seen = new Set<string>();
  for (const { key, signature } of signatures) {
    const hex = toHex(key);
    if (seen.has(hex)) continue;
    if (!authorised.some((p) => equalBytes(p.signing_key, key))) continue;
    if (!verifyObject(key, 'key-log', object, signature)) continue;
    seen.add(hex);
  }
  return seen.size;
}

function checkPartySet(parties: readonly PartyKey[], threshold?: number) {
  const keys = new Set(parties.map((p) => toHex(p.signing_key)));
  if (
    keys.size !== parties.length ||
    parties.some((p) => p.signing_key.length !== 32)
  ) {
    fail('Invalid key set');
  }
  if (
    threshold !== undefined &&
    (!Number.isSafeInteger(threshold) ||
      threshold < 1 ||
      threshold > parties.length)
  ) {
    fail('Invalid threshold');
  }
}

function checkWraps(
  wraps: readonly WrapDigest[],
  epoch: number,
  into: Map<string, Uint8Array>
) {
  for (const w of wraps) {
    if (
      w.epoch !== epoch ||
      w.digest.length !== 32 ||
      w.recipient_fp.length !== 32
    )
      fail('Invalid wrap digest');
    const k = wrapKey(w);
    if (into.has(k)) fail('Duplicate wrap');
    into.set(k, w.digest);
  }
}

/**
 * Replays a key log from genesis against the pinned `vault_id` and returns
 * the verified state. Owner and admin set changes need `threshold` owner
 * signatures; member, epoch and wrap entries need one owner or admin
 * signature. Signatures are counted once per distinct authorised key.
 */
export function verifyKeyLog(
  genesis: SignedGenesis,
  entries: readonly SignedEntry[],
  pinned: { readonly deployment: string; readonly vaultId: Uint8Array }
): KeyLogState {
  const g = genesis.body;
  if (
    g.kind !== 'genesis' ||
    g.deployment !== pinned.deployment ||
    g.nonce.length !== 16
  )
    fail('Invalid genesis');
  const vaultId = vaultIdOf(g);
  if (!equalBytes(vaultId, pinned.vaultId))
    fail('Genesis does not match the pinned vault');
  checkPartySet(g.owners, g.threshold);
  if (countSigners(g, genesis.signatures, g.owners) < g.threshold)
    fail('Genesis lacks owner signatures');

  let owners = g.owners;
  let threshold = g.threshold;
  let admins: readonly PartyKey[] = [];
  let headHash = genesisHash(genesis);
  let issuedAt = g.issued_at;
  const roles = new Map<string, RoleChange[]>();
  const epochs = new Map<string, EnvironmentEpoch>();

  entries.forEach((entry, i) => {
    const b = entry.body;
    if (
      b.seq !== i + 1 ||
      b.deployment !== pinned.deployment ||
      !equalBytes(b.vault_id, vaultId)
    )
      fail('Entry out of place');
    if (!equalBytes(b.prev_hash, headHash)) fail('Broken hash chain');
    if (!Number.isSafeInteger(b.issued_at) || b.issued_at < issuedAt)
      fail('Entry time went backwards');
    const p = b.payload;
    const managers = [...owners, ...admins];
    if (p.kind === 'owner_set' || p.kind === 'admin_set') {
      if (countSigners(b, entry.signatures, owners) < threshold)
        fail('Missing owner quorum');
      if (p.kind === 'owner_set') {
        checkPartySet(p.owners, p.threshold);
        owners = p.owners;
        threshold = p.threshold;
      } else {
        checkPartySet(p.admins);
        admins = p.admins;
      }
    } else {
      if (countSigners(b, entry.signatures, managers) < 1)
        fail('Missing admin signature');
      if (p.kind === 'member_role') {
        if (
          !ROLES.includes(p.role) ||
          p.signing_key.length !== 32 ||
          p.encryption_key.length !== 32
        )
          fail('Invalid member entry');
        const id = `${p.env}\u0000${p.user_id}`;
        roles.set(id, [
          ...(roles.get(id) ?? []),
          { seq: b.seq, role: p.role, signingKey: p.signing_key },
        ]);
      } else if (p.kind === 'epoch') {
        const current = epochs.get(p.env);
        if (p.epoch !== (current ? current.epoch + 1 : 1))
          fail('Epochs must advance by one');
        if (p.intake_key.length !== 32 || p.esk_key.length !== 32)
          fail('Invalid epoch keys');
        const wraps = new Map<string, Uint8Array>();
        checkWraps(p.wraps, p.epoch, wraps);
        epochs.set(p.env, {
          epoch: p.epoch,
          seq: b.seq,
          intakeKey: p.intake_key,
          eskKey: p.esk_key,
          pinAllowed: p.pin_allowed,
          wraps,
        });
      } else if (p.kind === 'wrap_addition') {
        const current = epochs.get(p.env);
        if (!current || current.epoch !== p.epoch)
          fail('Wraps must target the current epoch');
        checkWraps(p.wraps, p.epoch, current.wraps);
      } else {
        fail('Unknown entry kind');
      }
    }
    headHash = entryHash(entry);
    issuedAt = b.issued_at;
  });

  return {
    vaultId,
    headSeq: entries.length,
    headHash,
    owners,
    threshold,
    admins,
    epochOf: (env) => epochs.get(env) ?? null,
    roleAt: (env, userId, seq) => {
      const changes = roles.get(`${env}\u0000${userId}`) ?? [];
      return [...changes].reverse().find((c) => c.seq <= seq) ?? null;
    },
  };
}
