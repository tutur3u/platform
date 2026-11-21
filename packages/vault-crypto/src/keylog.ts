import { equalBytes, toHex } from './bytes';
import type { CanonicalObject } from './canonical';
import { contextBytes } from './context';
import { VaultCryptoError } from './errors';
import { sha256 } from './kdf';
import {
  assertEntryShape,
  assertGenesisShape,
  type EntryBody,
  type EntrySignature,
  type EpochDescriptor,
  type GenesisBody,
  type PartyKey,
  type Role,
  type SignedEntry,
  type SignedGenesis,
  type WrapDigest,
} from './keylog-types';
import { verifyObject } from './signing';

export * from './keylog-types';

/** Plain data objects; encodeCanonical validates them at runtime. */
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

/** Signature lists are sorted by key with no duplicates, so the chained hash is canonical. */
export function sortSignatures(
  list: readonly EntrySignature[]
): EntrySignature[] {
  return [...list].sort((a, b) => (toHex(a.key) < toHex(b.key) ? -1 : 1));
}

export type RoleChange = {
  readonly seq: number;
  readonly role: Role;
  readonly signingKey: Uint8Array;
};

export type EnvironmentEpoch = EpochDescriptor & {
  readonly seq: number;
  readonly wrapIndex: ReadonlyMap<string, Uint8Array>;
};

export type Managers = {
  readonly seq: number;
  readonly owners: readonly PartyKey[];
  readonly threshold: number;
  readonly admins: readonly PartyKey[];
};

export type KeyLogState = {
  readonly deployment: string;
  readonly vaultId: Uint8Array;
  readonly headSeq: number;
  readonly headHash: Uint8Array;
  /** Owners, threshold and admins in force after entry `seq`. */
  readonly managersAt: (seq: number) => Managers;
  /** The member role in force after entry `seq`, or null. */
  readonly roleAt: (
    env: string,
    userId: string,
    seq: number
  ) => RoleChange | null;
  /** The epoch in force after entry `seq` (the current epoch by default). */
  readonly epochAt: (env: string, seq?: number) => EnvironmentEpoch | null;
  readonly environments: () => string[];
};

const DECRYPTS: Record<Role, { normal: boolean; sensitive: boolean }> = {
  none: { normal: false, sensitive: false },
  viewer: { normal: false, sensitive: false },
  writer: { normal: false, sensitive: false },
  reader: { normal: true, sensitive: false },
  editor: { normal: true, sensitive: false },
  admin: { normal: true, sensitive: true },
};

export function wrapKey(
  w: Pick<WrapDigest, 'recipient_fp' | 'key_kind' | 'epoch'>
): string {
  return `${toHex(w.recipient_fp)}:${w.key_kind}:${w.epoch}`;
}

function fail(message: string): never {
  throw new VaultCryptoError('bad_signature', message);
}

const keyHex = (p: PartyKey) => toHex(p.signing_key);

/**
 * Every listed signature must be by a distinct authorised key, in key order,
 * and valid over the body; the count is the list length.
 */
function countSigners(
  body: GenesisBody | EntryBody,
  list: readonly EntrySignature[],
  authorised: readonly PartyKey[]
): number {
  const object = plain(body);
  let previous = '';
  for (const { key, signature } of list) {
    const hex = toHex(key);
    if (hex <= previous)
      fail('Signatures must be sorted by key without duplicates');
    previous = hex;
    if (!authorised.some((p) => equalBytes(p.signing_key, key)))
      fail('Signature by an unauthorised key');
    if (!verifyObject(key, 'key-log', object, signature))
      fail('Invalid signature');
  }
  return list.length;
}

function checkPartySet(parties: readonly PartyKey[]) {
  if (new Set(parties.map(keyHex)).size !== parties.length)
    fail('Duplicate key');
  if (new Set(parties.map((p) => p.user_id)).size !== parties.length)
    fail('Duplicate user');
}

function checkOwners(owners: readonly PartyKey[], threshold: number) {
  checkPartySet(owners);
  if (
    owners.length === 0 ||
    !Number.isSafeInteger(threshold) ||
    threshold < 1 ||
    threshold > owners.length
  ) {
    fail('Invalid owner threshold');
  }
}

function addWraps(
  wraps: readonly WrapDigest[],
  epoch: number,
  into: Map<string, Uint8Array>
) {
  for (const w of wraps) {
    if (w.epoch !== epoch) fail('Wrap for another epoch');
    const k = wrapKey(w);
    if (into.has(k)) fail('Duplicate wrap');
    into.set(k, w.digest);
  }
}

/**
 * Replays a key log from genesis against the pinned `vault_id`. Owner and
 * admin set changes need `threshold` owner signatures; other entries need one
 * owner or admin signature. A key removed from the owner or admin set loses
 * every authority it held, including member roles, and any change that removes
 * decryption access must carry the next epoch for each affected environment.
 */
export function verifyKeyLog(
  genesis: unknown,
  entries: readonly unknown[],
  pinned: { readonly deployment: string; readonly vaultId: Uint8Array }
): KeyLogState {
  assertGenesisShape(genesis);
  const g = genesis.body;
  if (g.deployment !== pinned.deployment)
    fail('Genesis for another deployment');
  const vaultId = vaultIdOf(g);
  if (!equalBytes(vaultId, pinned.vaultId))
    fail('Genesis does not match the pinned vault');
  checkOwners(g.owners, g.threshold);
  if (countSigners(g, genesis.signatures, g.owners) < g.threshold)
    fail('Genesis lacks owner quorum');

  const managers: Managers[] = [
    { seq: 0, owners: g.owners, threshold: g.threshold, admins: [] },
  ];
  const roles = new Map<string, Map<string, RoleChange[]>>();
  const epochs = new Map<string, EnvironmentEpoch[]>();
  let headHash = genesisHash(genesis);
  let issuedAt = g.issued_at;

  const current = () => managers[managers.length - 1] as Managers;
  const latestRole = (env: string, user: string) =>
    roles.get(env)?.get(user)?.at(-1) ?? null;
  const setRole = (env: string, user: string, change: RoleChange) => {
    const byUser = roles.get(env) ?? new Map<string, RoleChange[]>();
    byUser.set(user, [...(byUser.get(user) ?? []), change]);
    roles.set(env, byUser);
  };

  const applyEpoch = (d: EpochDescriptor, seq: number) => {
    const history = epochs.get(d.env) ?? [];
    const previous = history.at(-1);
    if (d.epoch !== (previous ? previous.epoch + 1 : 1))
      fail('Epochs must advance by one');
    if ((d.epoch === 1) !== (d.history === null))
      fail('History wraps are required after epoch 1');
    const wrapIndex = new Map<string, Uint8Array>();
    addWraps(d.wraps, d.epoch, wrapIndex);
    epochs.set(d.env, [...history, { ...d, seq, wrapIndex }]);
  };

  const requireRotation = (
    required: readonly string[],
    next: readonly EpochDescriptor[],
    seq: number
  ) => {
    const named = next.map((d) => d.env);
    if (new Set(named).size !== named.length) fail('Duplicate next epoch');
    const want = [...new Set(required.filter((env) => epochs.has(env)))].sort();
    const got = [...named].sort();
    if (got.length !== want.length || got.some((env, i) => env !== want[i])) {
      fail(
        'Revoking decryption access requires the next epoch for each affected environment'
      );
    }
    for (const d of next) applyEpoch(d, seq);
  };

  entries.forEach((entry, i) => {
    assertEntryShape(entry);
    const b = entry.body;
    if (
      b.seq !== i + 1 ||
      b.deployment !== pinned.deployment ||
      !equalBytes(b.vault_id, vaultId)
    ) {
      fail('Entry out of place');
    }
    if (!equalBytes(b.prev_hash, headHash)) fail('Broken hash chain');
    if (b.issued_at < issuedAt) fail('Entry time went backwards');
    const m = current();
    const p = b.payload;
    if (p.kind === 'owner_set' || p.kind === 'admin_set') {
      if (countSigners(b, entry.signatures, m.owners) < m.threshold)
        fail('Missing owner quorum');
      const owners = p.kind === 'owner_set' ? p.owners : m.owners;
      const threshold = p.kind === 'owner_set' ? p.threshold : m.threshold;
      checkOwners(owners, threshold);
      // A key removed from the owner set also leaves the admin set.
      const ownerKeys = new Set(owners.map(keyHex));
      const removedOwners = new Set(
        m.owners.map(keyHex).filter((k) => !ownerKeys.has(k))
      );
      const admins =
        p.kind === 'admin_set'
          ? p.admins
          : m.admins.filter((a) => !removedOwners.has(keyHex(a)));
      const after = new Set([...owners, ...admins].map(keyHex));
      const removed = new Set(
        [...m.owners, ...m.admins].map(keyHex).filter((k) => !after.has(k))
      );
      checkPartySet(admins);
      for (const [env, byUser] of roles) {
        for (const [user, changes] of byUser) {
          const last = changes.at(-1);
          if (
            last &&
            last.role !== 'none' &&
            removed.has(toHex(last.signingKey))
          ) {
            setRole(env, user, {
              seq: b.seq,
              role: 'none',
              signingKey: last.signingKey,
            });
          }
        }
      }
      requireRotation(
        removed.size > 0 ? [...epochs.keys()] : [],
        p.next_epochs,
        b.seq
      );
      managers.push({ seq: b.seq, owners, threshold, admins });
    } else {
      if (countSigners(b, entry.signatures, [...m.owners, ...m.admins]) < 1)
        fail('Missing admin signature');
      if (p.kind === 'member_role') {
        const before = DECRYPTS[latestRole(p.env, p.user_id)?.role ?? 'none'];
        const after = DECRYPTS[p.role];
        const loses =
          (before.normal && !after.normal) ||
          (before.sensitive && !after.sensitive);
        setRole(p.env, p.user_id, {
          seq: b.seq,
          role: p.role,
          signingKey: p.signing_key,
        });
        requireRotation(loses ? [p.env] : [], p.next_epochs, b.seq);
      } else if (p.kind === 'epoch') {
        applyEpoch(p.descriptor, b.seq);
      } else {
        const history = epochs.get(p.env);
        const latest = history?.at(-1);
        if (!history || !latest || latest.epoch !== p.epoch)
          fail('Wraps must target the current epoch');
        const wrapIndex = new Map(latest.wrapIndex);
        addWraps(p.wraps, p.epoch, wrapIndex);
        history[history.length - 1] = { ...latest, wrapIndex };
      }
    }
    headHash = entryHash(entry);
    issuedAt = b.issued_at;
  });

  const headSeq = entries.length;
  const bounded = (seq: number) => {
    if (!Number.isSafeInteger(seq) || seq < 0 || seq > headSeq)
      fail('Sequence beyond the verified head');
    return seq;
  };
  const lastAt = <T extends { readonly seq: number }>(
    items: readonly T[],
    seq: number
  ) => [...items].reverse().find((x) => x.seq <= bounded(seq)) ?? null;
  return {
    deployment: pinned.deployment,
    vaultId,
    headSeq,
    headHash,
    managersAt: (seq) => lastAt(managers, seq) as Managers,
    roleAt: (env, userId, seq) =>
      lastAt(roles.get(env)?.get(userId) ?? [], seq),
    epochAt: (env, seq = headSeq) => lastAt(epochs.get(env) ?? [], seq),
    environments: () => [...epochs.keys()],
  };
}
