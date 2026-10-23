import {
  failureClass,
  receiptReset,
  recoveryAdmissionKey,
  safeReceipt,
} from './failure-receipt';
export interface ChildThread {
  id: string;
  parentId: string | null;
  snoozedUntil: string | null;
  pendingQuestion: boolean;
  pendingApproval: boolean;
  activeWriterNodes: number;
}
export interface ChildRun {
  id: string;
  threadId: string;
  ordinal: number;
  status: string;
  completedAt: string | null;
  startedAt: string | null;
  instanceId: string;
  model: string | null;
  taskId: string | null;
  rootNodeId: string | null;
  queueHeld: boolean;
  monitor: boolean;
  limitResumeMessageId?: string | null;
}
export interface ChildTask {
  id: string;
  parentId: string;
  childId: string | null;
  status: string;
  origin: string;
  instanceId: string;
  deliveryState: string | null;
  observedByRunId: string | null;
}
export interface ChildFailure {
  runId: string;
  nodeId: string | null;
  message: string;
  classification: string | null;
  resetAt: string | null;
  observedAt: string;
}
export interface ChildTransfer {
  sourceId: string;
  parentId: string;
  runId: string | null;
  consumedAt: string | null;
}
export interface ChildSnapshot {
  threads: ChildThread[];
  runs: ChildRun[];
  tasks: ChildTask[];
  failures: ChildFailure[];
  transfers: ChildTransfer[];
}
export interface DrainEvidence {
  observedAt: string;
  drained: boolean;
}
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
export function reconcileChildren(
  snapshot: ChildSnapshot,
  parentId: string,
  now: Date,
  timezone?: string,
  drain: Record<string, DrainEvidence> = {}
) {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const thread of snapshot.threads) {
      if (
        thread.id !== parentId &&
        !descendants.has(thread.id) &&
        (thread.parentId === parentId || descendants.has(thread.parentId ?? ''))
      ) {
        descendants.add(thread.id);
        changed = true;
      }
    }
    for (const task of snapshot.tasks) {
      if (
        task.childId &&
        !descendants.has(task.childId) &&
        (task.parentId === parentId || descendants.has(task.parentId))
      ) {
        descendants.add(task.childId);
        changed = true;
      }
    }
  }
  const entries: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const threadId of descendants) {
    const thread = snapshot.threads.find((item) => item.id === threadId);
    if (!thread) continue;
    const task = snapshot.tasks.find((item) => item.childId === threadId);
    const runs = snapshot.runs.filter((run) => run.threadId === threadId);
    const original =
      runs.find((run) => run.taskId === task?.id) ??
      [...runs].sort((a, b) => a.ordinal - b.ordinal)[0];
    const latest = [...runs]
      .filter(
        (run) =>
          (terminal.has(run.status) ||
            ['running', 'starting', 'preparing', 'waiting'].includes(
              run.status
            )) &&
          !run.monitor &&
          (run.startedAt || run.id === original?.id)
      )
      .sort(
        (a, b) =>
          (Date.parse(b.completedAt ?? b.startedAt ?? '') || 0) -
            (Date.parse(a.completedAt ?? a.startedAt ?? '') || 0) ||
          b.ordinal - a.ordinal
      )[0];
    const queue = runs
      .filter((run) => run.status === 'queued')
      .map((run) => ({
        runId: run.id,
        providerInstanceId: run.instanceId,
        model: run.model,
        held: run.queueHeld,
        limitResumeMessageId: run.limitResumeMessageId ?? null,
      }));
    const failures = snapshot.failures.filter((failure) =>
      runs.some(
        (run) =>
          run.id === failure.runId &&
          run.status === 'failed' &&
          run.rootNodeId === failure.nodeId
      )
    );
    const relevant = runs.filter(
      (run) =>
        run.status === 'failed' &&
        !run.monitor &&
        (run.startedAt || run.id === original?.id)
    );
    if (!relevant.length) {
      const visible =
        latest ?? [...runs].sort((a, b) => b.ordinal - a.ordinal)[0];
      if (visible) relevant.push(visible);
    }
    for (const run of relevant) {
      const receipt = failures
        .filter((item) => item.runId === run.id)
        .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
      const classification =
        run.status === 'failed'
          ? failureClass(receipt?.message ?? '', receipt?.classification)
          : null;
      const key = classification
        ? recoveryAdmissionKey(threadId, run.id, classification)
        : `${threadId}:${run.id}:status`;
      if (seen.has(key)) continue;
      seen.add(key);
      const followup = Boolean(original && run.id !== original.id);
      const transfer = snapshot.transfers.find(
        (item) =>
          item.sourceId === threadId &&
          item.runId === run.id &&
          item.parentId === (task?.parentId ?? thread.parentId)
      );
      const delivery = transfer?.consumedAt
        ? 'delivered'
        : !followup && task?.observedByRunId
          ? 'delivered'
          : transfer || (!followup && task?.deliveryState === 'delivered')
            ? 'delivered'
            : followup || !task?.deliveryState
              ? 'missing-event'
              : 'unknown';
      const active = runs.some((item) =>
        ['running', 'starting', 'preparing', 'waiting'].includes(item.status)
      );
      const evidence = drain[threadId];
      const age = evidence
        ? now.getTime() - Date.parse(evidence.observedAt)
        : NaN;
      const writerDrained = Boolean(
        evidence?.drained &&
          age >= 0 &&
          age <= 5000 &&
          thread.activeWriterNodes === 0
      );
      const blockers = [
        ...(active ? ['run-not-idle'] : []),
        ...(queue.length ? ['queued-old-account-risk'] : []),
        ...(!writerDrained ? ['writer-drain-unverified'] : []),
        ...(thread.pendingQuestion ? ['pending-question'] : []),
        ...(thread.pendingApproval ? ['pending-approval'] : []),
      ];
      const autoResume = queue.some((item) => !item.held);
      const safe = classification
        ? safeReceipt(
            receipt?.message ?? '[terminal receipt unavailable]',
            classification
          )
        : null;
      entries.push({
        threadId,
        parentThreadId: task?.parentId ?? thread.parentId,
        taskId: task?.id ?? null,
        runId: run.id,
        kind: followup
          ? 'thread-send-follow-up'
          : task?.origin === 'provider_native'
            ? 'provider-native-subagent'
            : 'app-owned-delegated-task',
        originalTaskStatus: task?.status ?? 'unknown',
        originalRunId: original?.id ?? null,
        latestTurnStatus: latest?.status ?? 'unknown',
        latestRunId: latest?.id ?? null,
        runStatus: run.status,
        providerInstanceId: run.instanceId,
        model: run.model,
        snoozedUntil: thread.snoozedUntil,
        queuedRuns: queue,
        redundantLimitResumes: queue
          .filter(
            (item) =>
              item.limitResumeMessageId?.startsWith(
                `limit-resume:${threadId}:${run.id}:`
              ) &&
              runs.some(
                (later) =>
                  later.ordinal > run.ordinal &&
                  later.startedAt &&
                  later.instanceId !== run.instanceId
              )
          )
          .map((item) => ({
            ...item,
            recommendation: 'preserve-text-then-t3_queue_cancel',
            reason: 'old-limit-resume-after-provider-continuation',
          })),
        pendingQuestion: thread.pendingQuestion,
        pendingApproval: thread.pendingApproval,
        failureClass: classification,
        terminalReceipt: safe?.text ?? null,
        receiptRedacted: safe?.redacted ?? false,
        resetAt:
          receipt?.resetAt ??
          (receipt
            ? receiptReset(receipt.message, receipt.observedAt, timezone)
            : null),
        delivery,
        parentDrainState:
          !followup && task?.observedByRunId ? 'observed' : 'unknown',
        failureObservedAt: receipt?.observedAt ?? null,
        resumeBoundary: autoResume
          ? (thread.snoozedUntil ?? 'existing-queued-run')
          : thread.pendingQuestion
            ? 'answer-pending-question'
            : thread.pendingApproval
              ? 'resolve-pending-approval'
              : 'parent-action',
        disposition: autoResume
          ? 'auto-resume-already-queued-do-not-duplicate'
          : !blockers.length
            ? 'safe-to-switch-account'
            : 'needs-parent-action',
        switchBlockers: blockers,
        recoveryAdmissionKey: classification ? key : null,
      });
    }
    if (!runs.length)
      entries.push({
        threadId,
        parentThreadId: thread.parentId,
        kind: 'app-owned-delegated-task',
        originalTaskStatus: task?.status ?? 'unknown',
        latestTurnStatus: 'unknown',
        delivery: 'unknown',
        disposition: 'needs-parent-action',
        switchBlockers: ['run-state-unavailable'],
      });
  }
  for (const task of snapshot.tasks.filter(
    (task) =>
      !task.childId &&
      (task.parentId === parentId || descendants.has(task.parentId))
  )) {
    const receipt = snapshot.failures
      .filter((item) => item.nodeId === task.id)
      .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    const classification =
      task.status === 'failed'
        ? failureClass(receipt?.message ?? '', receipt?.classification)
        : null;
    const safe = classification
      ? safeReceipt(
          receipt?.message ?? '[terminal receipt unavailable]',
          classification
        )
      : null;
    const runId = `native:${task.id}`;
    entries.push({
      threadId: task.parentId,
      taskId: task.id,
      runId,
      kind: 'provider-native-subagent',
      originalTaskStatus: task.status,
      latestTurnStatus: task.status,
      providerInstanceId: task.instanceId,
      failureClass: classification,
      terminalReceipt: safe?.text ?? null,
      receiptRedacted: safe?.redacted ?? false,
      resetAt:
        receipt?.resetAt ??
        (receipt
          ? receiptReset(receipt.message, receipt.observedAt, timezone)
          : null),
      delivery: task.observedByRunId
        ? 'delivered'
        : task.deliveryState === 'delivered'
          ? 'delivered'
          : task.deliveryState
            ? 'unknown'
            : 'missing-event',
      disposition: 'needs-parent-action',
      switchBlockers: ['provider-native-writer-drain-unverified'],
      recoveryAdmissionKey: classification
        ? recoveryAdmissionKey(task.parentId, runId, classification)
        : null,
    });
  }
  return {
    parentThreadId: parentId,
    observedAt: now.toISOString(),
    entries,
    limitations: [
      'Read-only reconciliation; no notification, resume, switch or failover performed.',
      'Delivery receipts prove recorded observation, not completed recovery.',
      'Unbound later-turn failures require parent reconciliation; admission remains a separate transaction.',
    ],
  };
}

export function recoveryBlockers(
  entry: Record<string, unknown> | undefined
): string[] {
  if (!entry?.failureClass) return ['recovery-event-unverified'];
  if (entry.disposition === 'auto-resume-already-queued-do-not-duplicate')
    return ['recovery-already-queued'];
  if (entry.latestRunId && entry.latestRunId !== entry.runId)
    return ['recovery-superseded-run'];
  if (entry.pendingQuestion || entry.pendingApproval)
    return ['recovery-pending-input'];
  const blockers = Array.isArray(entry.switchBlockers)
    ? entry.switchBlockers
    : ['writer-drain-unverified'];
  return blockers.map((reason) => `recovery-${reason}`);
}
