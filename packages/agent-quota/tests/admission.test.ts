import { describe, expect, it } from 'vitest';
import { accountKey, admit, recordObservation } from '../src/admission';
import { emptyLedger } from '../src/hook-ledger';
import type { AdmissionRequest } from '../src/hooks-types';
import type { AccountUsage } from '../src/types';

const now = new Date('2026-10-23T01:00:00Z');
function account(instanceId: string, usedPercent = 20): AccountUsage {
  return {
    instanceId,
    provider: 'codex',
    label: instanceId,
    available: true,
    models: ['model'],
    accountIdentityHash: instanceId.padEnd(64, 'a'),
    windows: [
      {
        kind: 'short',
        usedPercent,
        authoritative: true,
        observedAt: now.toISOString(),
        resetsAt: '2026-10-23T02:00:00Z',
        source: 'fixture',
      },
    ],
  };
}
function request(accounts: AccountUsage[]): AdmissionRequest {
  return {
    requestId: 'request-1',
    threadId: 'mastermind-owner',
    currentInstanceId: 'owner',
    requirements: {
      capability: 'implementation',
      authorizedInstanceIds: accounts.map((x) => x.instanceId),
      privacyApprovedInstanceIds: accounts.map((x) => x.instanceId),
      candidates: accounts.map((x) => ({
        instanceId: x.instanceId,
        model: 'model',
        capabilities: ['implementation', 'review'],
      })),
    },
    policy: {
      orchestratorReservePercent: 30,
      nearUsedPercent: 90,
      unknownMaxConcurrent: 1,
    },
  };
}
function setup(pool = account('worker')) {
  const accounts = [account('owner', 80), pool];
  return { accounts, active: [], ledger: emptyLedger(), now };
}
describe('one-shot quota admission', () => {
  it('maps stale quota to unknown capacity and bounds reservations', () => {
    const context = setup();
    const worker = context.accounts[1];
    if (!worker) throw Error('fixture');
    worker.windows[0] = {
      ...worker.windows[0],
      kind: 'short',
      source: 'fixture',
      authoritative: true,
      observedAt: '2026-10-22T00:00:00Z',
    };
    const input = request(context.accounts);
    expect(admit(input, context)).toMatchObject({
      status: 'admit',
      chosen: { providerInstanceId: 'worker' },
    });
    const second = admit({ ...input, requestId: 'request-2' }, context);
    expect(second).toMatchObject({
      status: 'block',
      reasons: ['no-eligible-pool'],
    });
    expect(second.pools.find((x) => x.pool === 'worker')).toMatchObject({
      state: 'STALE',
      quotaState: 'UNKNOWN',
      activeReservations: 1,
      reasons: ['unknown-reservation-cap'],
    });
  });
  it('deduplicates aliases for native and pending reservation counting', () => {
    const context = setup({ ...account('a'), windows: [] });
    context.accounts.push({
      ...context.accounts[1],
      ...account('b'),
      accountIdentityHash: account('a').accountIdentityHash,
      windows: [],
    });
    const input = request(context.accounts);
    expect(admit(input, context).status).toBe('admit');
    const second = admit(
      { ...input, requestId: 'different-project-request' },
      context
    );
    expect(second.status).toBe('block');
    expect(
      second.pools.filter((x) => x.instanceIds.includes('a'))
    ).toHaveLength(1);
    expect(
      second.pools.find((x) => x.instanceIds.includes('a'))?.activeReservations
    ).toBe(1);
  });
  it('keeps observed exhaustion until reset and does not clear it on success', () => {
    const context = setup();
    const worker = context.accounts[1];
    if (!worker) throw Error('fixture');
    const input = request(context.accounts);
    recordObservation(context.ledger, {
      eventId: 'limit',
      instanceId: 'worker',
      accountKey: accountKey(worker),
      outcome: 'usage-limit',
      observedAt: now.toISOString(),
      resetsAt: '2026-10-23T01:01:00Z',
    });
    recordObservation(context.ledger, {
      eventId: 'success',
      instanceId: 'worker',
      accountKey: accountKey(worker),
      outcome: 'success',
      observedAt: now.toISOString(),
    });
    expect(admit(input, context)).toMatchObject({
      status: 'block',
      reasons: ['no-eligible-pool'],
    });
    expect(
      admit(input, { ...context, now: new Date('2026-10-23T01:01:01Z') })
    ).toMatchObject({ status: 'block' });
    worker.windows.forEach((window) => {
      window.observedAt = '2026-10-23T01:01:01Z';
      window.resetsAt = '2026-10-23T06:01:00Z';
    });
    expect(
      admit(input, { ...context, now: new Date('2026-10-23T01:01:01Z') })
    ).toMatchObject({
      status: 'admit',
      chosen: { providerInstanceId: 'worker' },
    });
  });
  it('does not infer a reset for usage-limit without one', () => {
    const context = setup();
    const worker = context.accounts[1];
    if (!worker) throw Error('fixture');
    recordObservation(context.ledger, {
      eventId: 'limit',
      instanceId: 'worker',
      accountKey: accountKey(worker),
      outcome: 'usage-limit',
      observedAt: now.toISOString(),
    });
    expect(
      admit(request(context.accounts), {
        ...context,
        now: new Date('2027-01-01T00:00:00Z'),
      }).pools.find((x) => x.pool === 'worker')
    ).toMatchObject({ state: 'EXHAUSTED', resetAt: null });
  });
  it('honours orchestrator reserve at equality and for unknown usage', () => {
    for (const windows of [account('owner', 70).windows, []]) {
      const context = {
        accounts: [{ ...account('owner'), windows }],
        active: [],
        ledger: emptyLedger(),
        now,
      };
      expect(
        admit(request(context.accounts), context).pools[0]?.reasons
      ).toContain('orchestrator-reserve');
    }
  });
  it('excludes author pool and aliases from independent review', () => {
    const context = setup();
    const author = account('author');
    context.accounts = [
      account('owner', 80),
      author,
      { ...account('alias'), accountIdentityHash: author.accountIdentityHash },
    ];
    const input = request(context.accounts);
    input.requirements.capability = 'review';
    input.requirements.authorInstanceId = 'author';
    const result = admit(input, context);
    expect(result.status).toBe('block');
    expect(
      result.pools.find((x) => x.instanceIds.includes('author'))?.reasons
    ).toContain('reviewer-independence');
  });
  it('never falls back to exhausted pools and returns exact per-pool blockers', () => {
    const context = setup(account('worker', 100));
    const result = admit(request(context.accounts), context);
    expect(result.status).toBe('block');
    expect(result.pools.find((x) => x.pool === 'worker')?.reasons).toContain(
      'pool-exhausted'
    );
    expect(context.ledger.reservations).toEqual([]);
  });
  it('requires explicit capability, privacy and authorization approval', () => {
    const context = setup();
    const input = request(context.accounts);
    input.requirements.privacyApprovedInstanceIds = [];
    expect(
      admit(input, context).pools.every((x) =>
        x.reasons.includes('capability-privacy-or-authorization-unverified')
      )
    ).toBe(true);
  });
  it('shares reservations across owner threads and reconciles a native heartbeat once', () => {
    const context = setup({ ...account('worker'), windows: [] });
    const input = request(context.accounts);
    input.policy.unknownMaxConcurrent = 2;
    expect(admit(input, context).status).toBe('admit');
    const worker = context.accounts[1];
    if (!worker) throw Error('fixture');
    recordObservation(context.ledger, {
      eventId: 'heartbeat',
      requestId: input.requestId,
      instanceId: 'worker',
      accountKey: accountKey(worker),
      outcome: 'success',
      observedAt: now.toISOString(),
      terminal: false,
      nativeReservationId: 'child-1',
    });
    const next = {
      ...context,
      active: [{ instanceId: 'worker', count: 1, reservationIds: ['child-1'] }],
    };
    const second = admit(
      { ...input, requestId: 'request-upskii', threadId: 'upskii' },
      next
    );
    expect(second.status).toBe('admit');
    expect(
      second.pools.find((pool) => pool.pool === 'worker')?.activeReservations
    ).toBe(1);
    expect(
      admit(
        { ...input, requestId: 'request-tuturuuu', threadId: 'tuturuuu' },
        next
      ).status
    ).toBe('block');
  });
  it('keeps native reservation bindings unique and immutable', () => {
    const context = setup({ ...account('worker'), windows: [] });
    const input = request(context.accounts);
    input.policy.unknownMaxConcurrent = 2;
    admit(input, context);
    admit({ ...input, requestId: 'second' }, context);
    const worker = context.accounts[1];
    if (!worker) throw Error('fixture');
    const event = {
      eventId: 'heartbeat-1',
      requestId: input.requestId,
      instanceId: 'worker',
      accountKey: accountKey(worker),
      outcome: 'success' as const,
      observedAt: now.toISOString(),
      terminal: false,
      nativeReservationId: 'child',
    };
    recordObservation(context.ledger, event);
    expect(() =>
      recordObservation(context.ledger, {
        ...event,
        eventId: 'heartbeat-2',
        requestId: 'second',
      })
    ).toThrow('native-reservation-collision');
    expect(() =>
      recordObservation(context.ledger, {
        ...event,
        eventId: 'heartbeat-3',
        nativeReservationId: 'different',
      })
    ).toThrow('native-reservation-rebind');
    expect(
      admit(
        { ...input, requestId: 'third' },
        {
          ...context,
          active: [
            { instanceId: 'worker', count: 1, reservationIds: ['child'] },
          ],
        }
      ).status
    ).toBe('block');
  });
  it('does not release a reservation for an older observation', () => {
    const context = setup();
    const input = request(context.accounts);
    admit(input, context);
    const worker = context.accounts[1];
    if (!worker) throw Error('fixture');
    expect(() =>
      recordObservation(context.ledger, {
        eventId: 'old',
        requestId: input.requestId,
        instanceId: 'worker',
        accountKey: accountKey(worker),
        outcome: 'success',
        observedAt: '2026-10-22T00:00:00Z',
      })
    ).toThrow('observation-predates-reservation');
    expect(context.ledger.reservations).toHaveLength(1);
  });
  it('does not bypass owner reserves via unverified same-provider identities', () => {
    const context = setup();
    context.accounts = context.accounts.map((account) => ({
      ...account,
      accountIdentityHash: undefined,
    }));
    expect(
      admit(request(context.accounts), context).pools.find(
        (pool) => pool.pool === 'worker'
      )?.reasons
    ).toContain('orchestrator-account-identity-unverified');
  });
  it('records capacity failures without fabricating headroom and deduplicates events', () => {
    const context = setup();
    const worker = context.accounts[1];
    if (!worker) throw Error('fixture');
    const event = {
      eventId: 'capacity',
      model: 'model',
      instanceId: 'worker',
      accountKey: accountKey(worker),
      outcome: 'capacity-error' as const,
      observedAt: now.toISOString(),
    };
    expect(recordObservation(context.ledger, event).replay).toBe(false);
    expect(recordObservation(context.ledger, event).replay).toBe(true);
    expect(
      admit(request(context.accounts), context).pools.find(
        (x) => x.pool === 'worker'
      )?.reasons
    ).toContain('capacity-cooldown');
  });
});
