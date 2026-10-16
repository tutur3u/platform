import { z } from 'zod';
import {
  graphCommandSchema,
  graphResultSchema,
} from '../operational-graph/contracts';
import { graphPlan } from '../operational-graph/domain';
import { intakePlan, updatePlan } from './operational-domain';
import {
  canonical,
  digest,
  type Event,
  fail,
  type Item,
  intakeItemSchema,
  itemSchema,
  type Note,
  noteSchema,
  type Operation,
  parseJson,
  updateSchema,
} from './operational-schema';

const revision = z.number().int().nonnegative();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const operationBodySchema = z.discriminatedUnion('command', [
  z
    .object({ command: z.literal('graph'), change: graphCommandSchema })
    .strict(),
  z
    .object({
      command: z.literal('intake'),
      input: z.array(intakeItemSchema).min(1).max(10_000),
    })
    .strict(),
  z.object({ command: z.literal('update'), change: updateSchema }).strict(),
  z.object({ command: z.literal('put'), note: noteSchema }).strict(),
  z
    .object({ command: z.literal('migrate'), beforeimage: z.string().min(1) })
    .strict(),
  z.object({ command: z.literal('import'), contentHash: hash }).strict(),
]);
export const responseSchema = z
  .object({
    result: z.union([
      graphResultSchema,
      itemSchema,
      noteSchema,
      z
        .object({ added: z.array(z.string()), retained: z.array(z.string()) })
        .strict(),
      z.object({ migrated: z.literal(true), beforeimageHash: hash }).strict(),
      z.object({ importedEvents: revision }).strict(),
    ]),
    revision,
    sourceDatabaseId: z.uuid(),
    liveVerificationPerformed: z.literal(false),
  })
  .strict();
export const proofSchema = z
  .object({
    version: z.literal(1),
    operationId: z.uuid(),
    sourceDatabaseId: z.uuid(),
    body: operationBodySchema,
    initialRevision: revision,
    finalRevision: revision,
    events: z
      .array(z.object({ seq: z.number().int().positive(), hash }).strict())
      .max(100_000),
  })
  .strict();
export const receiptRowSchema = z
  .object({
    operation_id: z.uuid(),
    payload_hash: hash,
    initial_revision: revision,
    final_revision: revision,
    response_json: z.string(),
  })
  .strict();
export const receiptSchema = receiptRowSchema
  .extend({ proof: proofSchema })
  .strict();
export type Receipt = z.infer<typeof receiptSchema>;
type Context = {
  kind: 'backlog' | 'operational-memory';
  sourceDatabaseId: string;
  events: Event[];
};
export function operationHash(
  kind: Context['kind'],
  op: Operation,
  body: unknown
) {
  return digest({
    operationId: op.operationId,
    kind,
    body: operationBodySchema.parse(body),
    expectedRevision: op.expectedRevision,
  });
}
function recordsAt(events: Event[], last: number, kind: Context['kind']) {
  const items = new Map<string, Item>();
  const notes = new Map<string, Note>();
  for (const event of events) {
    if (event.seq > last) break;
    if (kind === 'backlog')
      items.set(event.item_id, itemSchema.parse(parseJson(event.payload)));
    else notes.set(event.item_id, noteSchema.parse(parseJson(event.payload)));
  }
  return { items, notes };
}
function verifyChanges(
  events: Event[],
  expected: { item: Item | Note; action: string }[]
) {
  if (
    events.length !== expected.length ||
    events.some((e, i) => {
      const change = expected[i];
      return (
        !change ||
        e.item_id !== change.item.id ||
        e.action !== change.action ||
        canonical(parseJson(e.payload)) !== canonical(change.item)
      );
    })
  )
    fail(
      'RECEIPT_HISTORY_MISMATCH',
      'operation receipt differs from its original event interval'
    );
}
export function validateReceipt(input: unknown, context: Context) {
  const receipt = receiptSchema.parse(input);
  const proof = receipt.proof;
  const response = responseSchema.parse(parseJson(receipt.response_json));
  const last = context.events.at(-1)?.seq ?? 0;
  if (
    receipt.operation_id !== proof.operationId ||
    proof.sourceDatabaseId !== context.sourceDatabaseId ||
    response.sourceDatabaseId !== context.sourceDatabaseId ||
    receipt.initial_revision !== proof.initialRevision ||
    receipt.final_revision !== proof.finalRevision ||
    response.revision !== proof.finalRevision ||
    proof.initialRevision > proof.finalRevision ||
    proof.finalRevision > last ||
    receipt.payload_hash !==
      operationHash(
        context.kind,
        {
          operationId: proof.operationId,
          expectedRevision: proof.initialRevision,
        },
        proof.body
      )
  )
    fail(
      'RECEIPT_PROOF_MISMATCH',
      'operation identity, request or revision proof mismatch'
    );
  const interval = context.events.filter(
    (e) => e.seq > proof.initialRevision && e.seq <= proof.finalRevision
  );
  if (
    interval.length !== proof.finalRevision - proof.initialRevision ||
    canonical(proof.events) !==
      canonical(
        interval.map((event) => ({ seq: event.seq, hash: digest(event) }))
      )
  )
    fail('RECEIPT_HISTORY_MISMATCH', 'divergent operation event proof');
  const before = recordsAt(context.events, proof.initialRevision, context.kind);
  const body = proof.body;
  let expected: z.infer<typeof responseSchema>['result'];
  if (body.command === 'graph') {
    if (context.kind !== 'backlog')
      fail('STORE_KIND_MISMATCH', 'graph receipt belongs to backlog');
    const plan = graphPlan(before.items, body.change, proof.operationId);
    verifyChanges(interval, plan.events);
    expected = plan.result;
  } else if (body.command === 'update') {
    if (context.kind !== 'backlog')
      fail('STORE_KIND_MISMATCH', 'update receipt belongs to backlog');
    const plan = updatePlan(before.items, body.change);
    verifyChanges(interval, plan.events);
    expected = plan.item;
  } else if (body.command === 'intake') {
    if (context.kind !== 'backlog')
      fail('STORE_KIND_MISMATCH', 'intake receipt belongs to backlog');
    const plan = intakePlan(before.items, body.input);
    verifyChanges(
      interval,
      plan.added.map((item) => ({ item, action: 'capture' }))
    );
    expected = { added: plan.added.map((i) => i.id), retained: plan.retained };
  } else if (body.command === 'put') {
    if (context.kind !== 'operational-memory')
      fail('STORE_KIND_MISMATCH', 'note receipt belongs to operational memory');
    const prior = before.notes.get(body.note.id);
    if (
      prior &&
      (prior.scope !== body.note.scope ||
        prior.project !== body.note.project ||
        (prior.status === 'tombstone' && body.note.status !== 'tombstone'))
    )
      fail(
        'RECEIPT_HISTORY_MISMATCH',
        'note receipt violates scope or deletion fence'
      );
    verifyChanges(
      interval,
      prior && canonical(prior) === canonical(body.note)
        ? []
        : [
            {
              item: body.note,
              action: body.note.status === 'tombstone' ? 'tombstone' : 'put',
            },
          ]
    );
    expected = body.note;
  } else if (body.command === 'import') {
    expected = { importedEvents: interval.length };
  } else {
    verifyChanges(interval, []);
    const ordered = <T extends { id: string }>(rows: Iterable<T>) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const beforeimage = {
      version: 1,
      kind: context.kind,
      sourceDatabaseId: null,
      snapshotRevision: proof.initialRevision,
      items: ordered(before.items.values()),
      notes: ordered(before.notes.values()),
      events: context.events.filter((e) => e.seq <= proof.initialRevision),
      operations: [],
    };
    expected = { migrated: true, beforeimageHash: digest(beforeimage) };
  }
  if (canonical(response.result) !== canonical(expected))
    fail(
      'RECEIPT_HISTORY_MISMATCH',
      'operation response differs from recorded history'
    );
  return response;
}
export function makeReceipt(
  op: Operation,
  body: unknown,
  response: unknown,
  context: Context
): Receipt {
  const parsed = responseSchema.parse(response);
  const proof = proofSchema.parse({
    version: 1,
    operationId: op.operationId,
    sourceDatabaseId: context.sourceDatabaseId,
    body: operationBodySchema.parse(body),
    initialRevision: op.expectedRevision,
    finalRevision: parsed.revision,
    events: context.events
      .filter((e) => e.seq > op.expectedRevision && e.seq <= parsed.revision)
      .map((e) => ({ seq: e.seq, hash: digest(e) })),
  });
  const receipt = {
    operation_id: op.operationId,
    payload_hash: operationHash(context.kind, op, proof.body),
    initial_revision: op.expectedRevision,
    final_revision: parsed.revision,
    response_json: canonical(parsed),
    proof,
  };
  validateReceipt(receipt, context);
  return receipt;
}
