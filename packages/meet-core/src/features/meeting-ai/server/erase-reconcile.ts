import { z } from 'zod';
import {
  appendSchema,
  type Entry,
  type Head,
  type LedgerService,
  rebuildHoldRegistry,
} from './erase-ledger';

const body = appendSchema.options[0].shape.body;
const document = body.shape.plan.shape.document.unwrap();
const storedIntent = body.extend({
  plan: body.shape.plan.extend({
    document: document
      .extend({
        blocks: z.array(
          z.strictObject({
            index: z.number().int().nonnegative(),
            block_mac: z.string().regex(/^[0-9a-f]{64}$/),
          })
        ),
      })
      .nullable(),
  }),
});
export type RecoveryIntent = z.infer<typeof storedIntent>;
export type ReplayInput = {
  intent: RecoveryIntent;
  head: Head;
  outcome:
    | Extract<z.infer<typeof appendSchema>, { kind: 'outcome' }>['body']
    | null;
};
/** Only the isolated keyed restore runtime may implement these ports. */
export interface ReconcilePort {
  assertQuarantine(): Promise<void>;
  /** Exclusive hold barrier; preserve pending transitions. */
  installHolds(
    head: Head,
    holds: ReturnType<typeof rebuildHoldRegistry>
  ): Promise<void>;
  restoredOutcome(
    intent: RecoveryIntent
  ): Promise<'committed' | 'cancelled' | 'missing'>;
  /** Recreate plan/operation/progress by key. Every batch checks the verified
   * head and shared hold barrier; external applies require expiring leases.
   * Unknown history cutoff clears all restored versions of this document only.
   * Missing adapters must fail, never confirm a store.
   */
  replay(input: ReplayInput): Promise<void>;
  verify(
    input: ReplayInput
  ): Promise<{ residual: number; coldLoadsReady: boolean }>;
  recordReconciled(input: ReplayInput, replayed: boolean): Promise<void>;
  /** Atomically recheck head, pending transitions and all receipts. */
  release(head: Head): Promise<void>;
  hold(
    entry: Entry,
    reason: 'legal_hold_cora' | 'residual' | 'adapter_failed' | 'protocol'
  ): Promise<void>;
}
const equalHead = (a: Head, b: Head) => a.seq === b.seq && a.mac === b.mac;
/** Inert until the release owner supplies the admitted store adapters. */
export async function reconcileMeetErasure({
  ledger,
  port,
  protectedWorkspaceIds,
}: {
  ledger: LedgerService;
  port: ReconcilePort;
  protectedWorkspaceIds: readonly string[];
}) {
  await port.assertQuarantine();
  if (!protectedWorkspaceIds.length) throw Error('RESTORE_EC_CONFIG_REQUIRED');
  const verified = await ledger.verify();
  const entries: Entry[] = [];
  let after = 0;
  while (after < verified.head.seq) {
    const page = await ledger.read(after, 100);
    if (!equalHead(page.head, verified.head) || !page.entries.length)
      throw Error('RESTORE_LEDGER_CHANGED');
    for (const e of page.entries) {
      if (e.seq !== after + 1 || e.seq > verified.head.seq)
        throw Error('RESTORE_LEDGER_GAP');
      after = e.seq;
      entries.push(e);
    }
  }
  if (!equalHead((await ledger.verify()).head, verified.head))
    throw Error('RESTORE_LEDGER_CHANGED');
  const holds = rebuildHoldRegistry(entries);
  await port.installHolds(verified.head, holds);
  const intents = entries
    .filter((e) => e.kind === 'intent')
    .map((entry) => {
      const intent = storedIntent.parse(entry.body);
      const p = intent.plan;
      if (
        p.operation_key !== entry.operation_key ||
        p.ws_id !== entry.ws_id ||
        p.meeting_id !== entry.meeting_id ||
        protectedWorkspaceIds.includes(p.ws_id)
      )
        throw Error('RESTORE_SCOPE_DENIED');
      return { entry, intent };
    });
  const keys = new Set(intents.map(({ entry }) => entry.operation_key));
  if (
    keys.size !== intents.length ||
    entries.some((e) => e.kind === 'outcome' && !keys.has(e.operation_key))
  )
    throw Error('RESTORE_PROTOCOL');
  let held = 0;
  for (const { entry, intent } of intents) {
    if (!equalHead((await ledger.verify()).head, verified.head))
      throw Error('RESTORE_LEDGER_CHANGED');
    let outcome: ReplayInput['outcome'] = null;
    let cancelled = false;
    let violation = false;
    for (const e of entries.filter(
      (e) => e.kind === 'outcome' && e.operation_key === entry.operation_key
    )) {
      const event = appendSchema.parse({
        kind: e.kind,
        operation_key: e.operation_key,
        ws_id: e.ws_id,
        meeting_id: e.meeting_id,
        body: e.body,
      });
      if (event.kind !== 'outcome') throw Error('RESTORE_PROTOCOL');
      if (
        e.ws_id !== entry.ws_id ||
        e.meeting_id !== entry.meeting_id ||
        e.seq < entry.seq
      )
        violation = true;
      const next = event.body;
      if (next.state === 'committed') {
        if (cancelled) violation = true;
        outcome = next;
      } else if (next.reason === 'cancelled') {
        if (outcome?.state === 'committed') violation = true;
        cancelled = true;
        outcome = next;
      } else if (outcome?.state !== 'committed' && !cancelled) outcome = next;
    }
    if (violation) {
      held++;
      await port.hold(entry, 'protocol');
      continue;
    }
    if (!outcome && (await port.restoredOutcome(intent)) === 'cancelled') {
      await ledger.append({
        kind: 'outcome',
        operation_key: entry.operation_key,
        ws_id: entry.ws_id,
        meeting_id: entry.meeting_id,
        body: { state: 'aborted', reason: 'cancelled' },
      });
      throw Error('RESTORE_LEDGER_CHANGED');
    }
    const input = { intent, head: verified.head, outcome };
    if (outcome?.state === 'aborted') {
      await port.recordReconciled(input, false);
      continue;
    }
    if (
      [...holds.values()].some(
        (h) =>
          h.scope.ws_id === entry.ws_id &&
          (h.scope.meeting_id === null ||
            h.scope.meeting_id === entry.meeting_id)
      )
    ) {
      held++;
      await port.hold(entry, 'legal_hold_cora');
      continue;
    }
    try {
      await port.replay(input);
      const proof = await port.verify(input);
      if (proof.residual !== 0 || !proof.coldLoadsReady) {
        held++;
        await port.hold(entry, 'residual');
        continue;
      }
      await port.recordReconciled(input, true);
    } catch {
      held++;
      await port.hold(entry, 'adapter_failed');
    }
  }
  if (!equalHead((await ledger.verify()).head, verified.head))
    throw Error('RESTORE_LEDGER_CHANGED');
  if (!held) await port.release(verified.head);
  return { head: verified.head, intents: intents.length, held };
}
