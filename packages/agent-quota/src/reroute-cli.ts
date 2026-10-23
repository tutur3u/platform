import { readFileSync } from 'node:fs';
import { collectAll } from './collectors';
import { collectChildren } from './collectors/children';
import {
  admissionInput,
  bool,
  id,
  number,
  object,
  timestamp,
} from './hook-input';
import { HookError, readLedger } from './hook-ledger';
import { reconcileChildren } from './reconcile-children';
import { applyDescendantReceipts } from './recovery';
import { type RerouteEvidence, reroutePlan } from './reroute-plan';
export async function runReroute(args: string[]) {
  try {
    if (!args.includes('--parent')) throw new HookError('parent-required');
    const parent = id(args[args.indexOf('--parent') + 1]);
    const text = readFileSync(0, 'utf8');
    if (Buffer.byteLength(text) > 1_000_000)
      throw new HookError('input-too-large');
    const input = object(JSON.parse(text));
    const request = admissionInput(input);
    if (request.threadId !== parent)
      throw new HookError('parent-request-mismatch');
    const evidence: Record<string, RerouteEvidence> = {};
    for (const [thread, raw] of Object.entries(object(input.rerouteEvidence))) {
      const e = object(raw);
      if (
        !Array.isArray(e.writerPids) ||
        !Array.isArray(e.dirtyFiles) ||
        !e.dirtyFiles.every((x) => typeof x === 'string')
      )
        throw new HookError('drain-evidence-invalid');
      const configured =
        e.configured === undefined ? undefined : object(e.configured);
      const resumed = e.resumed === undefined ? undefined : object(e.resumed);
      evidence[id(thread)] = {
        configured: configured
          ? {
              providerInstanceId: id(configured.providerInstanceId),
              model: id(configured.model),
            }
          : undefined,
        resumed: resumed
          ? {
              providerInstanceId: id(resumed.providerInstanceId),
              model: id(resumed.model),
              taskId: id(resumed.taskId),
              runId: id(resumed.runId),
              status: id(resumed.status),
            }
          : undefined,
        observedAt: timestamp(e.observedAt),
        onlyResetBlocked: bool(e.onlyResetBlocked),
        writersComplete: bool(e.writersComplete),
        dirtyFilesPreserved: bool(e.dirtyFilesPreserved),
        custodyPreserved: bool(e.custodyPreserved),
        uncertainMutations: bool(e.uncertainMutations),
        dirtyFiles: e.dirtyFiles,
        writerPids: e.writerPids.map((raw) => {
          const p = object(raw);
          if (
            !['idle-stream-json', 'active', 'unknown'].includes(String(p.state))
          )
            throw new HookError('writer-state-invalid');
          return {
            pid: number(p.pid, 1, 2147483647),
            state: p.state as 'idle-stream-json' | 'active' | 'unknown',
          };
        }),
      };
    }
    const now = new Date();
    const drain = Object.fromEntries(
      Object.entries(evidence).map(([key, e]) => [
        key,
        {
          observedAt: e.observedAt,
          drained:
            e.writersComplete &&
            e.writerPids.every((p) => p.state === 'idle-stream-json'),
        },
      ])
    );
    const collected = await collectAll({
      snapshotsOnly: true,
      catalog: input.catalog,
    });
    const snapshot = collectChildren(parent);
    const reconciliation = reconcileChildren(
      snapshot,
      parent,
      now,
      typeof input.recoveryTimezone === 'string'
        ? input.recoveryTimezone
        : undefined,
      drain
    );
    const context = { ...collected, ledger: await readLedger(), now };
    applyDescendantReceipts(
      snapshot,
      context,
      typeof input.recoveryTimezone === 'string'
        ? input.recoveryTimezone
        : undefined
    );
    console.log(
      JSON.stringify({
        readOnly: true,
        observedAt: now.toISOString(),
        plans: reroutePlan(
          reconciliation.entries,
          request,
          context,
          evidence,
          snapshot
        ),
      })
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        status: 'block',
        reasons: [
          error instanceof HookError
            ? error.message
            : 'reroute-state-unavailable',
        ],
      })
    );
    process.exitCode = 1;
  }
}
