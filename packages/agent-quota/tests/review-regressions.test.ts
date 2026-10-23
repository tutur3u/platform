import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { admit } from '../src/admission';
import { collectSnapshot } from '../src/collectors/snapshot';
import { completedFailureClass, receiptReset } from '../src/failure-receipt';
import { emptyLedger, readLedger, transactLedger } from '../src/hook-ledger';
import type { AdmissionRequest } from '../src/hooks-types';
import { pruneLedger } from '../src/ledger-retention';
import { processStartedAt } from '../src/process-identity';
import type { ChildSnapshot } from '../src/reconcile-children';
import { applyDescendantReceipts } from '../src/recovery';
import {
  type RerouteEvidence,
  rerouteKey,
  reroutePlan,
} from '../src/reroute-plan';
import { acquireSwitchLease, releaseSwitchLease } from '../src/switch-safety';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T04:00:00Z');
const pool = (
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
function fixture() {
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
const snapshot: ChildSnapshot = {
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
const entry = {
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
const proof: RerouteEvidence = {
  observedAt: now.toISOString(),
  onlyResetBlocked: true,
  writerPids: [],
  writersComplete: true,
  dirtyFiles: [],
  dirtyFilesPreserved: true,
  custodyPreserved: true,
  uncertainMutations: false,
};
describe('independent review regressions', () => {
  it('applies a completed-run receipt before plain admission despite fresh zero-percent cache', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(snapshot, context);
    const result = admit(request, context);
    expect(result.pools.find((x) => x.pool === 'antigravity')).toMatchObject({
      state: 'EXHAUSTED',
      reasons: expect.arrayContaining(['observed-usage-limit']),
    });
    expect(result.chosen?.providerInstanceId).toBe('codex');
  });
  it('parses relative resets from observed time and rounds fractional seconds up', () => {
    expect(
      receiptReset('reset in 6 days, 23 hours', '2026-10-23T03:30:38Z')
    ).toBe('2026-10-30T02:30:38.000Z');
    expect(receiptReset('resets in 0.1 seconds', now.toISOString())).toBe(
      '2026-10-23T04:00:01.000Z'
    );
  });
  it('clears unknown-reset exhaustion only with a later fresh covering check', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(
      {
        ...snapshot,
        failures: snapshot.failures.map((x) => ({
          ...x,
          message: 'Usage Limit Reached',
          observedAt: now.toISOString(),
        })),
      },
      context
    );
    expect(
      admit(request, context).pools.find((x) => x.pool === 'antigravity')?.state
    ).toBe('EXHAUSTED');
    context.now = new Date(now.getTime() + 1000);
    context.accounts[1]!.windows[0]!.observedAt = context.now.toISOString();
    expect(
      admit({ ...request, requestId: 'next' }, context).pools.find(
        (x) => x.pool === 'antigravity'
      )?.state
    ).toBe('FRESH');
    context.now = new Date(now.getTime() + 16 * 60000);
    expect(
      admit({ ...request, requestId: 'stale-after-clear' }, context).pools.find(
        (x) => x.pool === 'antigravity'
      )?.state
    ).not.toBe('EXHAUSTED');
  });
  it('preserves real Antigravity scope and bounds uncovered Gemini', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-scope-'));
    try {
      await writeFile(
        join(dir, 'antigravity.json'),
        JSON.stringify({
          instanceId: 'antigravity',
          driver: 'antigravity',
          usageLimits: {
            checkedAt: now.toISOString(),
            windows: [
              {
                id: '3p-5h',
                label: 'Claude & GPT (shared) · 5-hour',
                usedPercent: 0,
                resetsAt: '2026-10-24T04:00:00Z',
              },
            ],
          },
        })
      );
      const { request, context } = fixture();
      context.accounts[1] = await collectSnapshot(
        pool('antigravity', 'antigravity'),
        dir
      );
      expect(context.accounts[1].windows[0]?.scope).toEqual({
        kind: 'models',
        modelPrefixes: ['claude-', 'gpt-'],
      });
      request.requirements.authorizedInstanceIds = ['antigravity'];
      expect(admit(request, context)).toMatchObject({
        chosen: { providerInstanceId: 'antigravity' },
        pools: expect.arrayContaining([
          expect.objectContaining({ pool: 'antigravity', state: 'UNKNOWN' }),
        ]),
      });
      expect(admit({ ...request, requestId: 'next' }, context).status).toBe(
        'block'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('keeps scoped Fable exhaustion off other Claude models and identifies all five homes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-claude-'));
    try {
      const identities = new Set();
      const accounts = [];
      for (const instanceId of [
        'claudeAgent',
        'claude_mira',
        'claude_kv',
        'claude_dd',
        'claude_hehe',
      ]) {
        await writeFile(
          join(dir, `${instanceId}.json`),
          JSON.stringify({
            instanceId,
            driver: 'claudeAgent',
            usageLimits: {
              checkedAt: now.toISOString(),
              windows: [
                {
                  id: 'five_hour',
                  label: 'Session',
                  usedPercent: 10,
                  resetsAt: '2026-10-24T04:00:00Z',
                },
                {
                  id: 'seven_day_fable',
                  label: 'Weekly · Fable',
                  usedPercent: 100,
                  resetsAt: '2026-10-24T04:00:00Z',
                },
              ],
            },
          })
        );
        const account = await collectSnapshot(
          { ...pool(instanceId, 'claude'), models: ['claude-opus-4-6'] },
          dir,
          {
            providerInstances: {
              [instanceId]: {
                driver: 'claudeAgent',
                config: {
                  homePath: `/fixture/${instanceId === 'claudeAgent' ? 'claude_skora' : instanceId}`,
                },
              },
            },
          }
        );
        identities.add(account.accountIdentityHash);
        accounts.push(account);
      }
      expect(identities.size).toBe(5);
      expect(identities.has(undefined)).toBe(false);
      const { request, context } = fixture();
      context.accounts = accounts;
      request.currentInstanceId = 'claudeAgent';
      request.requirements.authorizedInstanceIds = ['claude_dd'];
      request.requirements.privacyApprovedInstanceIds = ['claude_dd'];
      request.requirements.candidates = [
        {
          instanceId: 'claude_dd',
          model: 'claude-opus-4-6',
          capabilities: ['implementation'],
        },
      ];
      expect(admit(request, context).chosen?.providerInstanceId).toBe(
        'claude_dd'
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('revalidates the existing admission before planning rather than losing its chosen target', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(snapshot, context);
    expect(
      admit({ ...request, requestId: rerouteKey('child', 'run4') }, context)
        .chosen?.providerInstanceId
    ).toBe('codex');
    const plan = reroutePlan([entry], request, context, { child: proof })[0];
    expect(plan).toMatchObject({
      status: 'plan-ready',
      admission: { chosen: { providerInstanceId: 'codex' } },
    });
    context.accounts[2]!.windows[0]!.usedPercent = 100;
    expect(
      reroutePlan([entry], request, context, { child: proof })[0]?.status
    ).toBe('block');
  });
  it('blocks a reservation belonging to a different requesting thread', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(snapshot, context);
    admit({ ...request, requestId: rerouteKey('child', 'run4') }, context);
    context.ledger.reservations[0]!.threadId = 'another-owner';
    expect(
      reroutePlan([entry], request, context, { child: proof })[0]
    ).toMatchObject({
      status: 'block',
      blockers: expect.arrayContaining(['reservation-owner-mismatch']),
    });
  });
  it('does not substitute another candidate when the reserved model is removed', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(snapshot, context);
    admit({ ...request, requestId: rerouteKey('child', 'run4') }, context);
    request.requirements.candidates = request.requirements.candidates.map(
      (c) => ({ ...c, model: 'replacement-model' })
    );
    context.accounts.forEach((a) => {
      a.models?.push('replacement-model');
    });
    expect(
      reroutePlan([entry], request, context, { child: proof })[0]
    ).toMatchObject({ status: 'block', success: false });
  });
  it('requires a real matching running task and makes blockers win over caller claims', () => {
    const { request, context } = fixture();
    const resumed = {
      taskId: 'task6',
      runId: 'run6',
      providerInstanceId: 'codex',
      model: 'gpt-6.1-sol',
      status: 'running',
    };
    const evidence = { child: { ...proof, resumed } };
    expect(reroutePlan([entry], request, context, evidence)[0]).toMatchObject({
      status: 'block',
      success: false,
    });
    const live = {
      ...snapshot,
      runs: [
        {
          ...snapshot.runs[0]!,
          id: 'run6',
          taskId: 'task6',
          instanceId: 'codex',
          model: 'gpt-6.1-sol',
          status: 'running',
        },
      ],
    };
    expect(
      reroutePlan([entry], request, context, evidence, live)[0]
    ).toMatchObject({ status: 'resumed-on-provider', success: true });
    for (const mismatch of [
      { model: 'wrong-model' },
      { instanceId: 'wrong-provider' },
      { taskId: 'wrong-task' },
      { threadId: 'wrong-child' },
      { status: 'completed' },
    ]) {
      expect(
        reroutePlan([entry], request, context, evidence, {
          ...live,
          runs: [{ ...live.runs[0]!, ...mismatch }],
        })[0]
      ).toMatchObject({ status: 'block', success: false });
    }

    expect(
      reroutePlan(
        [{ ...entry, switchBlockers: ['unfinished-writers'] }],
        request,
        context,
        evidence,
        live
      )[0]
    ).toMatchObject({ status: 'block', success: false });
  });
  it('expires abandoned reservations while preserving active native assignments', () => {
    const { request, context } = fixture();
    admit(request, context);
    context.now = new Date(now.getTime() + 31 * 60000);
    admit({ ...request, requestId: 'next' }, context);
    expect(context.ledger.reservations.some((x) => x.requestId === 'new')).toBe(
      false
    );
    expect(
      context.ledger.retiredRequests?.some((x) => x.requestId === 'new')
    ).toBe(true);
  });
  it('rejects symlink and oversized provider caches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-cache-'));
    try {
      await writeFile(join(dir, 'other.json'), '{}');
      await symlink(join(dir, 'other.json'), join(dir, 'antigravity.json'));
      expect(
        (await collectSnapshot(pool('antigravity', 'antigravity'), dir)).windows
      ).toEqual([]);
      await rm(join(dir, 'antigravity.json'));
      await writeFile(
        join(dir, 'antigravity.json'),
        JSON.stringify({
          instanceId: 'antigravity',
          driver: 'antigravity',
          usageLimits: {
            checkedAt: now.toISOString(),
            windows: [
              {
                id: 'gemini-5h',
                usedPercent: 0,
                resetsAt: '2026-10-24T04:00:00Z',
              },
            ],
          },
          padding: ' '.repeat(2_000_001),
        })
      );
      expect(
        (await collectSnapshot(pool('antigravity', 'antigravity'), dir)).windows
      ).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('recovers a confirmed dead transaction owner and prunes old history', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-dead-'));
    try {
      await writeFile(
        join(dir, 'transaction.lock'),
        JSON.stringify({ pid: 2147483647, processStartedAt: now.toISOString() })
      );
      await transactLedger((ledger) => {
        ledger.observations.push({
          eventId: 'old',
          instanceId: 'codex',
          accountKey: 'fixture',
          outcome: 'success',
          observedAt: '2000-01-01T00:00:00Z',
        });
      }, dir);
      await transactLedger(() => {}, dir);
      expect((await readLedger(dir)).observations).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('checks process identity for release and refuses takeover of a live expired owner', () => {
    const ledger = emptyLedger();
    const identity = {
      threadId: 'owner',
      accountKey: 'fixture',
      attemptId: 'one',
      pid: process.pid,
      processStartedAt: processStartedAt(process.pid)!,
      ttlMs: 1000,
    };
    acquireSwitchLease(ledger, identity, now);
    expect(
      releaseSwitchLease(ledger, { ...identity, pid: identity.pid + 1 }, now)
        .status
    ).toBe('block');
    expect(
      acquireSwitchLease(
        ledger,
        { ...identity, attemptId: 'two' },
        new Date(now.getTime() + 1001)
      ).status
    ).toBe('block');
  });
  it('prunes old leases and observations without clearing unreset exhaustion', () => {
    const ledger = emptyLedger();
    ledger.observations.push({
      eventId: 'limit',
      accountKey: 'fixture',
      instanceId: 'antigravity',
      outcome: 'usage-limit',
      observedAt: '2000-01-01T00:00:00Z',
    });
    pruneLedger(ledger, now);
    expect(ledger.observations).toHaveLength(1);
  });
  it('releases a live expired lease through the real transaction cleanup path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'quota-expired-release-'));
    try {
      const actual = new Date();
      const identity = {
        threadId: 'owner',
        accountKey: 'fixture',
        attemptId: 'first',
        pid: process.pid,
        processStartedAt: processStartedAt(process.pid)!,
        ttlMs: 1000,
      };
      await transactLedger(
        (ledger) =>
          acquireSwitchLease(
            ledger,
            identity,
            new Date(actual.getTime() - 2000)
          ),
        dir
      );
      expect(
        (
          await transactLedger(
            (ledger) =>
              acquireSwitchLease(
                ledger,
                { ...identity, attemptId: 'second' },
                actual
              ),
            dir
          )
        ).status
      ).toBe('block');
      expect(
        (
          await transactLedger(
            (ledger) => releaseSwitchLease(ledger, identity, actual),
            dir
          )
        ).status
      ).toBe('released');
      expect(
        (
          await transactLedger(
            (ledger) =>
              acquireSwitchLease(
                ledger,
                { ...identity, attemptId: 'second' },
                actual
              ),
            dir
          )
        ).status
      ).toBe('acquired');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('keeps existing reservations counted when a blocked plan precedes another child', () => {
    const { request, context } = fixture();
    context.accounts[2]!.windows = [];
    applyDescendantReceipts(snapshot, context);
    admit({ ...request, requestId: rerouteKey('child', 'run4') }, context);
    const plans = reroutePlan(
      [
        { ...entry, switchBlockers: ['unfinished-writers'] },
        { ...entry, threadId: 'child2' },
      ],
      request,
      context,
      { child: proof, child2: proof }
    );
    expect(plans[1]?.admission.chosen).toBeUndefined();
    expect(
      plans[1]?.admission.pools.find((pool) => pool.pool === 'codex')?.reasons
    ).toContain('unknown-reservation-cap');
  });
  it('recognizes the exact reserved running continuation without treating it as a new switch', () => {
    const { request, context } = fixture();
    applyDescendantReceipts(snapshot, context);
    admit({ ...request, requestId: rerouteKey('child', 'run4') }, context);
    const resumed = {
      taskId: 'task6',
      runId: 'run6',
      providerInstanceId: 'codex',
      model: 'gpt-6.1-sol',
      status: 'running',
    };
    const live = {
      ...snapshot,
      runs: [
        {
          ...snapshot.runs[0]!,
          id: 'run6',
          taskId: 'task6',
          instanceId: 'codex',
          model: 'gpt-6.1-sol',
          status: 'running',
        },
      ],
    };
    expect(
      reroutePlan(
        [{ ...entry, latestRunId: 'run6', switchBlockers: ['run-not-idle'] }],
        request,
        context,
        { child: { ...proof, resumed } },
        live
      )[0]
    ).toMatchObject({ status: 'resumed-on-provider', success: true });
  });
  it('does not treat ordinary completed capacity analysis as a provider failure', () => {
    expect(
      completedFailureClass('Implemented capacity-aware routing; tests pass.')
    ).toBeNull();
    expect(
      completedFailureClass('We are currently at capacity. Try again later.')
    ).toBe('capacity');
    expect(
      completedFailureClass("You've hit your session limit · resets 11:20am")
    ).toBe('usage-limit');
  });
});
