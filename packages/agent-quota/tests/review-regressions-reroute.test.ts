import { describe, expect, it } from 'vitest';
import { admit } from '../src/admission';
import { applyDescendantReceipts } from '../src/recovery';
import { rerouteKey, reroutePlan } from '../src/reroute-plan';
import {
  entry,
  fixture,
  now,
  proof,
  snapshot,
} from './review-regressions-helpers';

describe('independent review regressions', () => {
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
    ).toMatchObject({
      status: 'resumed-on-provider',
      success: true,
      executionOutcome: 'verified-resumed-execution',
    });
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
});
