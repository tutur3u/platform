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
import { list } from './schema';
import { verifyObject } from './signing';
import { assertCanonicalX25519 } from './x25519';

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

/** The signed identifier of an EDK, so a client can check the key it unwrapped. */
export function edkId(edk: Uint8Array): Uint8Array {
  return sha256(contextBytes('edk-id', { edk })).subarray(0, 16);
}

/** Checks an unwrapped EDK against the identifier its signed descriptor names. */
export function assertEdkId(
  epoch: Pick<EpochDescriptor, 'edk_id'>,
  edk: Uint8Array
): void {
  if (!equalBytes(edkId(edk), epoch.edk_id)) {
    throw new VaultCryptoError(
      'bad_mac',
      'Unwrapped EDK does not match its epoch'
    );
  }
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
  readonly encryptionKey: Uint8Array;
};

export type StampedWrap = { readonly digest: Uint8Array; readonly seq: number };

export type EnvironmentEpoch = EpochDescriptor & {
  readonly seq: number;
  /** Wraps authorised at or before the sequence this view was taken at. */
  readonly wrapIndex: ReadonlyMap<string, Uint8Array>;
};

type StoredEpoch = EpochDescriptor & {
  readonly seq: number;
  readonly wraps_by_key: Map<string, StampedWrap>;
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
  /** The epoch in force after entry `seq` (the head by default), with wraps authorised by then. */
  readonly epochAt: (env: string, seq?: number) => EnvironmentEpoch | null;
  readonly environments: () => string[];
  /** Sequences in (from, to] where the user's authority on `env` can change. */
  readonly authorityChanges: (
    env: string,
    userId: string,
    from: number,
    to: number
  ) => number[];
};

export const DECRYPTS: Readonly<
  Record<Role, { readonly normal: boolean; readonly sensitive: boolean }>
> = {
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

const hex = (k: Uint8Array) => toHex(k);

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
    const k = hex(key);
    if (k <= previous)
      fail('Signatures must be sorted by key without duplicates');
    previous = k;
    if (!authorised.some((p) => equalBytes(p.signing_key, key)))
      fail('Signature by an unauthorised key');
    if (!verifyObject(key, 'key-log', object, signature))
      fail('Invalid signature');
  }
  return list.length;
}

function checkPartySet(parties: readonly PartyKey[]) {
  if (new Set(parties.map((p) => hex(p.signing_key))).size !== parties.length)
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

/**
 * Replays a key log from genesis against the pinned `vault_id`.
 *
 * - Owner and admin set changes need `threshold` owner signatures; other
 *   entries need one owner or admin signature.
 * - Each user ID is bound to one signing key across every role. Binding a new
 *   key to a user revokes every grant held under the old key, and a key can
 *   never be bound to two users.
 * - A key removed from the owner or admin set loses every authority it held.
 * - Any change that removes decryption access, or replaces a key that could
 *   decrypt, must carry the next epoch for each affected environment, with
 *   key identifiers and public keys never used before.
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
  const epochs = new Map<string, StoredEpoch[]>();
  const usedEpochKeys = new Set<string>();
  const userKey = new Map<string, string>();
  const keyUser = new Map<string, string>();
  for (const o of g.owners) {
    userKey.set(o.user_id, hex(o.signing_key));
    keyUser.set(hex(o.signing_key), o.user_id);
  }
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

  /** Binds user→key; returns envs where a replaced key held decryption access. */
  const bind = (user: string, key: Uint8Array, seq: number): string[] => {
    const k = hex(key);
    const owner = keyUser.get(k);
    if (owner !== undefined && owner !== user)
      fail('A key cannot be bound to two users');
    const previous = userKey.get(user);
    if (previous === undefined || previous === k) {
      userKey.set(user, k);
      keyUser.set(k, user);
      return [];
    }
    userKey.set(user, k);
    keyUser.set(k, user);
    return revokeKey(previous, seq);
  };

  /** Ends every member grant held under `key`; returns envs where it could decrypt. */
  const revokeKey = (key: string, seq: number): string[] => {
    const affected: string[] = [];
    for (const [env, byUser] of roles) {
      for (const [user, changes] of byUser) {
        const last = changes.at(-1);
        if (last && last.role !== 'none' && hex(last.signingKey) === key) {
          if (DECRYPTS[last.role].normal) affected.push(env);
          setRole(env, user, { ...last, seq, role: 'none' });
        }
      }
    }
    return affected;
  };

  const applyEpoch = (d: EpochDescriptor, seq: number) => {
    const history = epochs.get(d.env) ?? [];
    const previous = history.at(-1);
    if (d.epoch !== (previous ? previous.epoch + 1 : 1))
      fail('Epochs must advance by one');
    if ((d.epoch === 1) !== (d.history === null))
      fail('History wraps are required after epoch 1');
    assertCanonicalX25519(d.intake_key, 'intake key');
    assertCanonicalX25519(d.esk_key, 'ESK');
    for (const k of [d.edk_id, d.intake_key, d.esk_key].map(hex)) {
      if (usedEpochKeys.has(k)) fail('Epoch keys must be fresh');
      usedEpochKeys.add(k);
    }
    const wraps = new Map<string, StampedWrap>();
    addWraps(d.wraps, d.epoch, seq, wraps);
    epochs.set(d.env, [...history, { ...d, seq, wraps_by_key: wraps }]);
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

  list(entries, 'entries', Number.MAX_SAFE_INTEGER).forEach((entry, i) => {
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
      const ownerKeys = new Set(owners.map((o) => hex(o.signing_key)));
      const removedOwners = m.owners
        .filter((o) => !ownerKeys.has(hex(o.signing_key)))
        .map((o) => hex(o.signing_key));
      const admins =
        p.kind === 'admin_set'
          ? p.admins
          : m.admins.filter((a) => !removedOwners.includes(hex(a.signing_key)));
      checkPartySet(admins);
      // One key per user across the combined manager set; the same user may
      // be both owner and admin only under the same key.
      const combined = new Map<string, string>();
      for (const x of [...owners, ...admins]) {
        const k = combined.get(x.user_id);
        if (k !== undefined && k !== hex(x.signing_key))
          fail('Identity is bound to another key');
        combined.set(x.user_id, hex(x.signing_key));
      }
      const after = new Set(
        [...owners, ...admins].map((x) => hex(x.signing_key))
      );
      const removed = [
        ...new Set([...m.owners, ...m.admins].map((x) => hex(x.signing_key))),
      ].filter((k) => !after.has(k));
      const affected: string[] = [];
      for (const party of [...owners, ...admins]) {
        affected.push(...bind(party.user_id, party.signing_key, b.seq));
      }
      for (const k of removed) affected.push(...revokeKey(k, b.seq));
      requireRotation(
        removed.length > 0 ? [...epochs.keys()] : affected,
        p.next_epochs,
        b.seq
      );
      managers.push({ seq: b.seq, owners, threshold, admins });
    } else {
      if (countSigners(b, entry.signatures, [...m.owners, ...m.admins]) < 1)
        fail('Missing admin signature');
      if (p.kind === 'member_role') {
        assertCanonicalX25519(p.encryption_key, 'member encryption key');
        const prior = latestRole(p.env, p.user_id);
        const manager = [...m.owners, ...m.admins].find(
          (x) => x.user_id === p.user_id
        );
        if (manager && !equalBytes(manager.signing_key, p.signing_key)) {
          fail('Identity is bound to another key');
        }
        const affected = bind(p.user_id, p.signing_key, b.seq);
        const before = prior ? DECRYPTS[prior.role] : DECRYPTS.none;
        const after = DECRYPTS[p.role];
        const loses =
          (before.normal && !after.normal) ||
          (before.sensitive && !after.sensitive);
        const keyChanged =
          prior !== null &&
          before.normal &&
          (!equalBytes(prior.signingKey, p.signing_key) ||
            !equalBytes(prior.encryptionKey, p.encryption_key));
        setRole(p.env, p.user_id, {
          seq: b.seq,
          role: p.role,
          signingKey: p.signing_key,
          encryptionKey: p.encryption_key,
        });
        requireRotation(
          [...affected, ...(loses || keyChanged ? [p.env] : [])],
          p.next_epochs,
          b.seq
        );
      } else if (p.kind === 'epoch') {
        applyEpoch(p.descriptor, b.seq);
      } else {
        const latest = epochs.get(p.env)?.at(-1);
        if (!latest || latest.epoch !== p.epoch)
          fail('Wraps must target the current epoch');
        addWraps(p.wraps, p.epoch, b.seq, latest.wraps_by_key);
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
    epochAt: (env, seq = headSeq) => {
      const e = lastAt(epochs.get(env) ?? [], seq);
      if (!e) return null;
      const { wraps_by_key, ...descriptor } = e;
      const wrapIndex = new Map(
        [...wraps_by_key]
          .filter(([, w]) => w.seq <= seq)
          .map(([k, w]) => [k, w.digest] as const)
      );
      return { ...descriptor, wrapIndex };
    },
    environments: () => [...epochs.keys()],
    authorityChanges: (env, userId, from, to) => {
      bounded(from);
      bounded(to);
      const seqs = [
        ...managers.map((x) => x.seq),
        ...(roles.get(env)?.get(userId) ?? []).map((x) => x.seq),
      ];
      return [...new Set(seqs.filter((x) => x > from && x <= to))].sort(
        (a, b) => a - b
      );
    },
  };
}

function addWraps(
  wraps: readonly WrapDigest[],
  epoch: number,
  seq: number,
  into: Map<string, StampedWrap>
) {
  for (const w of wraps) {
    if (w.epoch !== epoch) fail('Wrap for another epoch');
    const k = wrapKey(w);
    if (into.has(k)) fail('Duplicate wrap');
    into.set(k, { digest: w.digest, seq });
  }
}
