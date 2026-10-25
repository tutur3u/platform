import { emptyLedger } from '../src/hook-ledger';
import type { AdmissionRequest } from '../src/hooks-types';
import type { ChildSnapshot } from '../src/reconcile-children';
import { type RerouteEvidence, rerouteKey } from '../src/reroute-plan';
import type { AccountUsage } from '../src/types';

export const now = new Date('2026-10-23T04:00:00Z');
export const pool = (
  instanceId: string,
  provider: AccountUsage['provider']
): AccountUsage => ({
  instanceId,
  provider,
  label: instanceId,
  available: true,
  models: ['gemini-4-argon-high', 'gpt-6.1-sol'],
  windows: [
    {
      kind: 'short',
      usedPercent: 0,
      authoritative: true,
      source: 'fixture',
      observedAt: now.toISOString(),
      resetsAt: '2026-10-24T04:00:00Z',
    },
  ],
});
export function fixture() {
  const accounts = [
    pool('owner', 'claude'),
    pool('antigravity', 'antigravity'),
    pool('codex', 'codex'),
  ];
  const request: AdmissionRequest = {
    requestId: 'new',
    threadId: 'parent',
    currentInstanceId: 'owner',
    requirements: {
      capability: 'implementation',
      authorizedInstanceIds: ['antigravity', 'codex'],
      privacyApprovedInstanceIds: ['antigravity', 'codex'],
      candidates: [
        {
          instanceId: 'antigravity',
          model: 'gemini-4-argon-high',
          capabilities: ['implementation'],
        },
        {
          instanceId: 'codex',
          model: 'gpt-6.1-sol',
          capabilities: ['implementation'],
        },
      ],
    },
    policy: {
      orchestratorReservePercent: 30,
      nearUsedPercent: 90,
      unknownMaxConcurrent: 1,
    },
  };
  return {
    request,
    context: { accounts, active: [], ledger: emptyLedger(), now },
  };
}
export const snapshot: ChildSnapshot = {
  threads: [],
  tasks: [],
  transfers: [],
  runs: [
    {
      id: 'run4',
      threadId: 'child',
      ordinal: 4,
      status: 'completed',
      completedAt: '2026-10-23T03:30:38Z',
      startedAt: '2026-10-23T03:30:00Z',
      instanceId: 'antigravity',
      model: 'gemini-4-argon-high',
      taskId: 'task',
      rootNodeId: 'root',
      queueHeld: false,
      monitor: false,
    },
  ],
  failures: [
    {
      runId: 'run4',
      nodeId: 'root',
      message: 'Usage Limit Reached. reset in 6 days, 23 hours',
      classification: null,
      resetAt: null,
      observedAt: '2026-10-23T03:30:38Z',
    },
  ],
};
export const entry = {
  threadId: 'child',
  runId: 'run4',
  latestRunId: 'run4',
  failureClass: 'usage-limit',
  providerInstanceId: 'antigravity',
  failureObservedAt: '2026-10-23T03:30:38Z',
  resetAt: '2026-10-30T02:30:38Z',
  recoveryAdmissionKey: rerouteKey('child', 'run4'),
  switchBlockers: [],
  queuedRuns: [],
};
export const proof: RerouteEvidence = {
  observedAt: now.toISOString(),
  onlyResetBlocked: true,
  writerPids: [],
  writersComplete: true,
  dirtyFiles: [],
  dirtyFilesPreserved: true,
  custodyPreserved: true,
  uncertainMutations: false,
};
