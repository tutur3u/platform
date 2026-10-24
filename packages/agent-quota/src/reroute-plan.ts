import { admit } from './admission';
import { recoveryAdmissionKey } from './failure-receipt';
import type { AdmissionContext, AdmissionRequest } from './hooks-types';
import { pruneLedger } from './ledger-retention';
import type { ChildSnapshot } from './reconcile-children';
import { applyRecoveryReceipt } from './recovery';

export interface RerouteEvidence {
  observedAt: string;
  onlyResetBlocked: boolean;
  writerPids: {
    pid: number;
    state: 'idle-stream-json' | 'active' | 'unknown';
  }[];
  writersComplete: boolean;
  dirtyFiles: string[];
  dirtyFilesPreserved: boolean;
  custodyPreserved: boolean;
  uncertainMutations: boolean;
  configured?: { providerInstanceId: string; model: string };
  resumed?: {
    taskId: string;
    runId: string;
    providerInstanceId: string;
    model: string;
    status: string;
  };
}
export function rerouteKey(threadId: string, runId: string) {
  return recoveryAdmissionKey(threadId, runId, 'usage-limit');
}
export function reroutePlan(
  entries: Record<string, unknown>[],
  request: AdmissionRequest,
  context: AdmissionContext,
  evidence: Record<string, RerouteEvidence>,
  snapshot?: ChildSnapshot
) {
  const simulation = { ...context, ledger: structuredClone(context.ledger) };
  pruneLedger(
    simulation.ledger,
    context.now,
    context.active.flatMap((item) => item.reservationIds ?? [])
  );
  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.failureClass === 'usage-limit')
    .map((entry) => {
      const threadId = String(entry.threadId);
      const runId = String(entry.runId);
      const key = rerouteKey(threadId, runId);
      if (seen.has(key)) return null;
      seen.add(key);
      const proof = evidence[threadId];
      const age = proof
        ? context.now.getTime() - Date.parse(proof.observedAt)
        : NaN;
      const blockers: string[] = [];
      if (!proof || !(age >= 0 && age <= 5000))
        blockers.push('drain-evidence-missing-or-stale');
      if (!proof?.onlyResetBlocked) blockers.push('reset-not-only-blocker');
      if (
        !proof?.writersComplete ||
        proof.writerPids.some((x) => x.state !== 'idle-stream-json')
      )
        blockers.push('writer-active-or-unverified');
      if (
        !proof?.dirtyFilesPreserved ||
        !proof.custodyPreserved ||
        proof.uncertainMutations
      )
        blockers.push('state-preservation-unverified');
      const switchBlockers = Array.isArray(entry.switchBlockers)
        ? entry.switchBlockers
        : ['run-state-unavailable'];
      blockers.push(
        ...switchBlockers
          .filter((x) => x !== 'queued-old-account-risk')
          .map(String)
      );
      if (entry.latestRunId !== runId) blockers.push('failure-superseded');
      if (entry.pendingQuestion || entry.pendingApproval)
        blockers.push('pending-input');
      const queuedRuns = Array.isArray(entry.queuedRuns)
        ? entry.queuedRuns
        : [];
      const oldQueuedRuns = queuedRuns.filter(
        (item) => item.providerInstanceId === entry.providerInstanceId
      );
      if (oldQueuedRuns.length !== queuedRuns.length)
        blockers.push('queued-other-account-work-needs-owner-review');
      applyRecoveryReceipt(entry, simulation);
      const existing = simulation.ledger.reservations.find(
        (item) => item.requestId === key
      );
      let revalidation = simulation;
      let requirements = request.requirements;
      if (existing) {
        if (existing.threadId !== request.threadId)
          blockers.push('reservation-owner-mismatch');
        revalidation = {
          ...simulation,
          ledger: structuredClone(simulation.ledger),
          active: simulation.active.map((item) =>
            item.reservationIds?.includes(existing.nativeReservationId ?? '')
              ? {
                  ...item,
                  count: Math.max(0, item.count - 1),
                  reservationIds: item.reservationIds.filter(
                    (id) => id !== existing.nativeReservationId
                  ),
                }
              : item
          ),
        };
        revalidation.ledger.reservations =
          revalidation.ledger.reservations.filter(
            (item) => item.requestId !== key
          );
        requirements = {
          ...requirements,
          candidates: requirements.candidates.filter(
            (item) =>
              item.instanceId === existing.instanceId &&
              item.model === existing.model
          ),
        };
      }
      const admission = admit(
        { ...request, requirements, requestId: key, recovery: undefined },
        revalidation
      );
      const chosen = admission.chosen;
      if (blockers.length && !existing)
        simulation.ledger.reservations = simulation.ledger.reservations.filter(
          (item) => item.requestId !== key
        );
      if (!chosen) blockers.push('no-eligible-pool');
      const resumed = Boolean(
        chosen &&
          proof?.resumed &&
          snapshot?.runs.some(
            (run) =>
              run.id === proof.resumed?.runId &&
              run.threadId === threadId &&
              run.taskId === proof.resumed.taskId &&
              run.status === 'running' &&
              run.instanceId === chosen.providerInstanceId &&
              run.model === chosen.model
          )
      );
      // Post-resume verification is not another switch. Only the exact reserved
      // running task can explain this active-run/superseded boundary.
      if (resumed && existing && entry.latestRunId === proof?.resumed?.runId) {
        for (const reason of ['run-not-idle', 'failure-superseded']) {
          const index = blockers.indexOf(reason);
          if (index >= 0) blockers.splice(index, 1);
        }
      }
      if (proof?.resumed && !resumed) blockers.push('resumed-run-unverified');
      const configured =
        chosen &&
        proof?.configured?.providerInstanceId === chosen.providerInstanceId &&
        proof.configured.model === chosen.model;
      const executionOutcome = resumed
        ? 'verified-resumed-execution'
        : proof?.resumed
          ? 'resume-proof-unverified'
          : configured
            ? 'configured-only'
            : chosen
              ? 'admission-only'
              : 'no-eligible-pool';

      return {
        threadId,
        failedRunId: runId,
        idempotencyKey: key,
        status: blockers.length
          ? 'block'
          : resumed
            ? 'resumed-on-provider'
            : configured
              ? 'configured'
              : blockers.length
                ? 'block'
                : 'plan-ready',
        success: Boolean(resumed && blockers.length === 0),
        executionOutcome,
        verifiedRunningOnTarget: resumed,
        blockers,
        admission,
        drainChecks: {
          ...proof,
          queuedRuns,
          pendingQuestion: entry.pendingQuestion,
          pendingApproval: entry.pendingApproval,
        },
        operations: [
          ...(oldQueuedRuns.length
            ? [
                { operation: 'read-and-save-queued-text', runs: oldQueuedRuns },
                {
                  operation: 't3_queue_cancel',
                  runs: oldQueuedRuns,
                  gate: 'text-saved; then confirm queue empty',
                },
              ]
            : []),
          {
            operation: 'agent-quota admit',
            gate: 'commit shared reservation with idempotencyKey; revalidate target and recovery receipt after queue drain',
          },
          {
            operation: 'agent-quota switch-lease acquire',
            gate: 'owner-thread lease',
          },
          {
            operation: 'agent-quota switch-check',
            gate: 'fresh readback, empty queue, drained writers/jobs, preserved custody',
          },
          {
            operation: 't3_thread_configure',
            target: chosen,
            gate: 'all gates passed; configuration alone is not success',
          },
          {
            operation: 't3_thread_send',
            mode: 'auto',
            gate: 'saved resume text plus state readback; require returned taskId; no blind retry',
          },
          {
            operation: 'task_status',
            gate: 'verify taskId, provider, model and running run; then release lease',
          },
        ],
        successorPath: blockers.length
          ? 'handover-check: at most one successor; preserve source/index/dirty files/jobs/true child parents/questions/watches/unknown writes; independent packet and binding acceptance recorded before predecessor settles'
          : null,
        staleContinuation: {
          possible: Boolean(entry.snoozedUntil),
          action:
            'reconcile-children after resume and at native event; queue_cancel only a verified redundant limit-resume after preserving its text',
        },
      };
    })
    .filter((x) => x !== null);
}
