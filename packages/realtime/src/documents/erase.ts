import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const generation = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const eraseCommandSchema = z
  .object({
    aud: z.literal('tuturuuu.document-erase'),
    kind: z.enum([
      'document-erase-freeze',
      'document-erase-state',
      'document-erase-apply',
      'document-erase-release',
    ]),
    topic: z.string().regex(/^meeting-document-[a-f0-9-]{36}$/),
    document_id: z.guid(),
    owner_id: z.guid().optional(),
    operation_key: z.guid(),
    doc_generation: generation,
    exp: z.number().int(),
    nonce: z.guid(),
    key_version: z.number().int().positive(),
    decision: z.enum(['blocks', 'whole', 'leave']),
    expected_state_hash: hash,
    lease_exp: z.number().int(),
    blocks: z
      .array(
        z
          .object({ index: z.number().int().nonnegative(), block_sha256: hash })
          .strict()
      )
      .max(200),
    expected_post_pm_hash: hash.nullable(),
  })
  .strict();
export type EraseCommand = z.infer<typeof eraseCommandSchema>;
export const documentEraseStateSchema = z.object({
  doc_generation: generation,
  doc_hold: z.boolean(),
  restore_hold: z.boolean(),
  active_operation_key: z.string().nullable().optional(),
  document_store_states: z.record(z.string(), z.string()),
  pg_installed_generation: generation.optional(),
  pg_state: z.array(z.number().int().min(0).max(255)).max(524288).optional(),
  pg_post_state_hash: hash.optional(),
  pg_post_pm_hash: hash.optional(),
  last_receipt: z
    .object({ post_state_hash: hash, post_pm_hash: hash })
    .optional(),
});
export type DocumentEraseState = z.infer<typeof documentEraseStateSchema>;
export function documentBlocked(state: DocumentEraseState) {
  return (
    state.doc_hold ||
    state.restore_hold ||
    ['S-DL', 'S-DS'].some((store) => {
      const status = state.document_store_states[store];
      return (
        status !== undefined &&
        !['confirmed', 'not_applicable'].includes(status)
      );
    })
  );
}
export async function sha256(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
    ),
    (v) => v.toString(16).padStart(2, '0')
  ).join('');
}
export async function verifyEraseCommand(
  raw: string,
  publicKeys: string | undefined,
  now = Date.now()
) {
  try {
    const [body, signature, ...extra] = raw.split('.');
    if (!body || !signature || extra.length) return null;
    const decode = (s: string) =>
      Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
        c.charCodeAt(0)
      );
    const command = eraseCommandSchema.parse(
      JSON.parse(new TextDecoder().decode(decode(body)))
    );
    if (
      command.exp * 1000 <= now ||
      command.exp * 1000 > now + 31000 ||
      command.lease_exp <= now ||
      command.lease_exp > command.exp * 1000
    )
      return null;
    const keys = z
      .record(z.string(), z.string())
      .parse(JSON.parse(publicKeys ?? '{}'));
    const encoded = keys[String(command.key_version)];
    if (!encoded) return null;
    const key = await crypto.subtle.importKey(
      'raw',
      decode(encoded),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    if (
      !(await crypto.subtle.verify(
        'Ed25519',
        key,
        decode(signature),
        new TextEncoder().encode(body)
      ))
    )
      return null;
    return command;
  } catch {
    return null;
  }
}

export function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  throw new Error('Expected JSON');
}
