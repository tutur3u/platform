import { z } from 'zod';

const uuid = z.uuid().transform((s) => s.toLowerCase());
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime();
const store = z
  .string()
  .regex(/^(S-(T|L|DL|DS|DH|PL)|S-X:[a-z0-9_-]+|R-[TA])$/);
const plan = z.strictObject({
  v: z.literal(1),
  kind: z.enum([
    'meeting_erase',
    'label_removal',
    'recording_delete',
    'whole_transcript',
  ]),
  ws_id: uuid,
  meeting_id: uuid,
  operation_key: uuid,
  actor_role: z.enum([
    'host',
    'workspace_admin',
    'subject',
    'tuturuuu_operator',
    'system',
  ]),
  subject: z
    .union([
      z.strictObject({ tag: hash, key_version: integer.positive() }),
      z.strictObject({ kind: z.literal('selection') }),
    ])
    .nullable(),
  generation_target: integer,
  doc_generation_target: integer.nullable(),
  transcript: z
    .strictObject({
      chunks: z.array(
        z.strictObject({
          chunk_id: uuid,
          segments: z.union([z.array(integer), z.literal('single_speaker')]),
        })
      ),
      sessions: z.array(uuid),
    })
    .nullable(),
  document: z
    .strictObject({
      document_id: uuid,
      decision: z.enum(['blocks', 'whole', 'leave']),
      pre_state_hash: hash,
      blocks: z.array(z.strictObject({ index: integer, block_sha256: hash })),
    })
    .nullable(),
  playground: z
    .strictObject({
      decision: z.enum(['whole', 'leave']),
      rooms: z.array(
        z.strictObject({
          resource: z.enum(['playground', 'problem']),
          resource_id: uuid,
        })
      ),
    })
    .nullable(),
  label_removal: z
    .strictObject({ selector: uuid, legacy_rewrite: z.boolean() })
    .nullable(),
  recording: z
    .strictObject({
      session_id: uuid,
      storage_paths: z.array(
        z.string().regex(/^[0-9a-f-]{36}(\/[0-9a-f-]{36})*(\.[a-z0-9]+)?$/)
      ),
    })
    .nullable(),
  stores: z.array(store),
});
const envelope = {
  operation_key: uuid,
  ws_id: uuid,
  meeting_id: uuid.nullable(),
};
const holdBody = z.strictObject({
  transition_id: uuid,
  hold_id: uuid,
  scope: z.strictObject({ ws_id: uuid, meeting_id: uuid.nullable() }),
  kind: z.enum(['legal_hold', 'retention_lock']),
  at: timestamp,
  approval_ref: uuid,
  review_by: timestamp,
});
export const appendSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...envelope,
    kind: z.literal('intent'),
    body: z.strictObject({ plan, plan_hash: hash }),
  }),
  z.strictObject({
    ...envelope,
    kind: z.literal('outcome'),
    body: z.discriminatedUnion('state', [
      z.strictObject({
        state: z.literal('committed'),
        generation_after: integer,
        doc_generation_target: integer.nullable(),
        history_cutoff_id: z.string().regex(/^\d+$/).nullable(),
        attested_state_hash: hash.nullable(),
      }),
      z.strictObject({
        state: z.literal('aborted'),
        reason: z.enum(['refused', 'cancelled']),
      }),
    ]),
  }),
  z.strictObject({
    ...envelope,
    kind: z.literal('receipt'),
    body: z.strictObject({
      store,
      state: z.enum([
        'confirmed',
        'not_applicable',
        'attested_unchanged',
        'reconciled',
      ]),
      installed_generation: integer.nullable(),
      post_state_hash: hash.nullable(),
      post_pm_hash: hash.nullable(),
      verified_zero: z.literal(true),
      rows_rewritten: integer,
      hwm: z.string().regex(/^\d+$/).nullable(),
    }),
  }),
  z.strictObject({
    ...envelope,
    kind: z.literal('hold_create'),
    body: holdBody,
  }),
  z.strictObject({
    ...envelope,
    kind: z.literal('hold_release'),
    body: holdBody,
  }),
]);
export type Append = z.infer<typeof appendSchema>;
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export function canonical(value: Json): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k]!)}`)
    .join(',')}}`;
}
export const ZERO_MAC = '0'.repeat(64);
export function bytes(hex: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
}
export async function mac(
  key: CryptoKey,
  domain: string,
  previous: string,
  body: string
) {
  const prefix = new TextEncoder().encode(`${domain}\0`);
  const prev = bytes(previous);
  const data = new TextEncoder().encode(body);
  const message = new Uint8Array(prefix.length + prev.length + data.length);
  message.set(prefix);
  message.set(prev, prefix.length);
  message.set(data, prefix.length + prev.length);
  return Array.from(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, message)),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    ),
    (b) => b.toString(16).padStart(2, '0')
  ).join('');
}
type IntentBody = Extract<Append, { kind: 'intent' }>['body'];
type IntentDocument = NonNullable<IntentBody['plan']['document']>;
type StoredIntent = Omit<IntentBody, 'plan'> & {
  plan: Omit<IntentBody['plan'], 'document'> & {
    document:
      | (Omit<IntentDocument, 'blocks'> & {
          blocks: { index: number; block_mac: string }[];
        })
      | null;
  };
};
export type LedgerBody =
  | Exclude<Append, { kind: 'intent' }>['body']
  | IntentBody
  | StoredIntent;
export type Entry = {
  seq: number;
  prev_mac: string;
  kind: Append['kind'];
  operation_key: string;
  ws_id: string;
  meeting_id: string | null;
  at: string;
  key_version: number;
  body: LedgerBody;
  mac: string;
};
export type Head = { seq: number; mac: string };
export type Keys = (version: number) => CryptoKey | Promise<CryptoKey>;
export async function verifyChain(
  entries: Entry[],
  keys: Keys,
  expected?: Head,
  start: Head = { seq: 0, mac: ZERO_MAC }
): Promise<Head> {
  let head = start;
  for (const entry of entries) {
    const { mac: signature, ...unsigned } = entry;
    if (
      entry.seq !== head.seq + 1 ||
      entry.prev_mac !== head.mac ||
      !Number.isSafeInteger(entry.seq)
    )
      throw Error('LEDGER_CHAIN_INVALID');
    const computed = await mac(
      await keys(entry.key_version),
      'meet-erase-ledger/v1',
      entry.prev_mac,
      canonical(unsigned)
    );
    if (computed !== signature) throw Error('LEDGER_CHAIN_INVALID');
    head = { seq: entry.seq, mac: signature };
  }
  if (expected && (expected.seq !== head.seq || expected.mac !== head.mac))
    throw Error('LEDGER_HEAD_MISMATCH');
  return head;
}
export function rebuildHoldRegistry(verifiedEntries: Entry[]) {
  const holds = new Map<string, z.infer<typeof holdBody>>();
  for (const e of verifiedEntries) {
    if (e.kind !== 'hold_create' && e.kind !== 'hold_release') continue;
    const b = holdBody.parse(e.body);
    if (
      b.hold_id !== e.operation_key ||
      b.scope.ws_id !== e.ws_id ||
      b.scope.meeting_id !== e.meeting_id
    )
      throw Error('LEDGER_HOLD_SCOPE');
    if (e.kind === 'hold_create') {
      if (holds.has(b.hold_id)) throw Error('LEDGER_HOLD_CONFLICT');
      holds.set(b.hold_id, b);
    } else {
      const active = holds.get(b.hold_id);
      if (
        !active ||
        canonical(active.scope) !== canonical(b.scope) ||
        active.kind !== b.kind
      )
        throw Error('LEDGER_HOLD_CONFLICT');
      holds.delete(b.hold_id);
    }
  }
  return holds;
}
export interface LedgerService {
  append(value: Append): Promise<Entry>;
  verify(): Promise<{ head: Head; holds: z.infer<typeof holdBody>[] }>;
  read(after: number, limit: number): Promise<{ entries: Entry[]; head: Head }>;
}
export function eraseLedger(binding: LedgerService | undefined): LedgerService {
  if (!binding) throw Error('MEET_ERASE_LEDGER_UNAVAILABLE');
  return binding;
}
