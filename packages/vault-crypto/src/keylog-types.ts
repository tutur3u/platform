import {
  bool,
  bytes,
  count,
  list,
  malformed,
  oneOf,
  record,
  text,
} from './schema';

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

export const WRAP_KINDS = ['edk', 'intake', 'esk'] as const;
export type WrapKind = (typeof WRAP_KINDS)[number];

export type WrapDigest = {
  readonly recipient_fp: Uint8Array;
  readonly key_kind: WrapKind;
  readonly epoch: number;
  readonly digest: Uint8Array;
};

/**
 * One environment epoch. `history` carries the digests of the wraps of the
 * previous epoch's normal keys (EDK and intake) under the new EDK and of the
 * previous ESK under the new ESK; it is null only for epoch 1.
 */
export type EpochDescriptor = {
  readonly env: string;
  readonly epoch: number;
  readonly edk_id: Uint8Array;
  readonly intake_key: Uint8Array;
  readonly esk_key: Uint8Array;
  readonly pin_allowed: boolean;
  readonly wraps: readonly WrapDigest[];
  readonly history: {
    readonly normal: Uint8Array;
    readonly sensitive: Uint8Array;
  } | null;
};

export type EntryPayload =
  | {
      readonly kind: 'owner_set';
      readonly owners: readonly PartyKey[];
      readonly threshold: number;
      readonly next_epochs: readonly EpochDescriptor[];
    }
  | {
      readonly kind: 'admin_set';
      readonly admins: readonly PartyKey[];
      readonly next_epochs: readonly EpochDescriptor[];
    }
  | {
      readonly kind: 'member_role';
      readonly env: string;
      readonly user_id: string;
      readonly role: Role;
      readonly signing_key: Uint8Array;
      readonly encryption_key: Uint8Array;
      readonly next_epochs: readonly EpochDescriptor[];
    }
  | { readonly kind: 'epoch'; readonly descriptor: EpochDescriptor }
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

function party(value: unknown): void {
  const o = record(value, ['user_id', 'signing_key'], 'party');
  text(o.user_id, 'user_id');
  bytes(o.signing_key, 32, 'signing_key');
}

function wrap(value: unknown): void {
  const o = record(
    value,
    ['recipient_fp', 'key_kind', 'epoch', 'digest'],
    'wrap'
  );
  bytes(o.recipient_fp, 32, 'recipient_fp');
  oneOf(o.key_kind, WRAP_KINDS, 'key_kind');
  count(o.epoch, 'epoch', 1);
  bytes(o.digest, 32, 'digest');
}

function descriptor(value: unknown): void {
  const o = record(
    value,
    [
      'env',
      'epoch',
      'edk_id',
      'intake_key',
      'esk_key',
      'pin_allowed',
      'wraps',
      'history',
    ],
    'epoch'
  );
  text(o.env, 'env');
  count(o.epoch, 'epoch', 1);
  bytes(o.edk_id, 16, 'edk_id');
  bytes(o.intake_key, 32, 'intake_key');
  bytes(o.esk_key, 32, 'esk_key');
  bool(o.pin_allowed, 'pin_allowed');
  list(o.wraps, 'wraps').forEach(wrap);
  if (o.history !== null) {
    const h = record(o.history, ['normal', 'sensitive'], 'history');
    bytes(h.normal, 32, 'history');
    bytes(h.sensitive, 32, 'history');
  }
}

function signatures(value: unknown): void {
  for (const s of list(value, 'signatures', 64)) {
    const o = record(s, ['key', 'signature'], 'signature');
    bytes(o.key, 32, 'key');
    bytes(o.signature, 64, 'signature');
  }
}

export function assertGenesisShape(
  value: unknown
): asserts value is SignedGenesis {
  const signed = record(value, ['body', 'signatures'], 'genesis');
  const b = record(
    signed.body,
    ['deployment', 'kind', 'nonce', 'owners', 'threshold', 'issued_at'],
    'genesis'
  );
  text(b.deployment, 'deployment');
  if (b.kind !== 'genesis') malformed('genesis');
  bytes(b.nonce, 16, 'nonce');
  list(b.owners, 'owners', 64).forEach(party);
  count(b.threshold, 'threshold', 1);
  count(b.issued_at, 'issued_at');
  signatures(signed.signatures);
}

export function assertEntryShape(value: unknown): asserts value is SignedEntry {
  const signed = record(value, ['body', 'signatures'], 'entry');
  const b = record(
    signed.body,
    ['deployment', 'vault_id', 'seq', 'prev_hash', 'issued_at', 'payload'],
    'entry'
  );
  text(b.deployment, 'deployment');
  bytes(b.vault_id, 32, 'vault_id');
  count(b.seq, 'seq', 1);
  bytes(b.prev_hash, 32, 'prev_hash');
  count(b.issued_at, 'issued_at');
  if (
    b.payload === null ||
    typeof b.payload !== 'object' ||
    Object.getPrototypeOf(b.payload) !== Object.prototype
  ) {
    malformed('payload');
  }
  const kindDescriptor = Object.getOwnPropertyDescriptor(b.payload, 'kind');
  const kind =
    kindDescriptor && 'value' in kindDescriptor
      ? kindDescriptor.value
      : undefined;
  if (kind === 'owner_set') {
    const p = record(
      b.payload,
      ['kind', 'owners', 'threshold', 'next_epochs'],
      'owner_set'
    );
    list(p.owners, 'owners', 64).forEach(party);
    count(p.threshold, 'threshold', 1);
    list(p.next_epochs, 'next_epochs').forEach(descriptor);
  } else if (kind === 'admin_set') {
    const p = record(b.payload, ['kind', 'admins', 'next_epochs'], 'admin_set');
    list(p.admins, 'admins', 256).forEach(party);
    list(p.next_epochs, 'next_epochs').forEach(descriptor);
  } else if (kind === 'member_role') {
    const p = record(
      b.payload,
      [
        'kind',
        'env',
        'user_id',
        'role',
        'signing_key',
        'encryption_key',
        'next_epochs',
      ],
      'member_role'
    );
    text(p.env, 'env');
    text(p.user_id, 'user_id');
    oneOf(p.role, ROLES, 'role');
    bytes(p.signing_key, 32, 'signing_key');
    bytes(p.encryption_key, 32, 'encryption_key');
    list(p.next_epochs, 'next_epochs').forEach(descriptor);
  } else if (kind === 'epoch') {
    descriptor(record(b.payload, ['kind', 'descriptor'], 'epoch').descriptor);
  } else if (kind === 'wrap_addition') {
    const p = record(
      b.payload,
      ['kind', 'env', 'epoch', 'wraps'],
      'wrap_addition'
    );
    text(p.env, 'env');
    count(p.epoch, 'epoch', 1);
    list(p.wraps, 'wraps').forEach(wrap);
  } else {
    malformed('entry kind');
  }
  signatures(signed.signatures);
}
