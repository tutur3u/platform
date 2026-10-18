import { describe, expect, it } from 'vitest';
import { digest, type Item } from '../cli/operational-schema';
import { buildOutcomeProjectionPage } from '../operational-graph/projection';
import {
  compareAndCreateOperationalTask,
  reconcileOperationalTaskAssignment,
} from './assignment';
import type {
  AssignmentCommand,
  AssignmentInspectionScope,
  AssignmentReceipt,
  AssignmentReconciliationPort,
  AtomicAssignmentPort,
  PlannerContext,
} from './contracts';
import {
  plannerDenial,
  samePlannerIdentity,
  validatePlannerContext,
} from './planner';

const databaseId = '11111111-1111-4111-8111-111111111111';
const reservationId = '22222222-2222-4222-8222-222222222222';
const grantId = '33333333-3333-4333-8333-333333333333';
const operationId = '44444444-4444-4444-8444-444444444444';
const secondOperationId = '55555555-5555-4555-8555-555555555555';
function context(id = 'target', priority = 0): PlannerContext {
  const item: Item = {
    id,
    priority,
    title: id,
    source: 'synthetic',
    acceptance: 'literal controls pass',
    kind: 'feature',
    dependencies: [],
    requiredEvidence: ['test'],
    status: 'captured',
    owner: '',
    links: [],
    note: '',
  };
  const snapshot = {
    sourceDatabaseId: databaseId,
    revision: 1,
    items: [item],
    events: [
      {
        seq: 1,
        item_id: id,
        at: '2026-10-13T00:00:00Z',
        action: 'intake',
        payload: JSON.stringify(item),
      },
    ],
  };
  const graph = buildOutcomeProjectionPage({ snapshot, limit: 500 });
  const expected = {
    sourceDatabaseId: databaseId,
    revision: graph.revision,
    snapshotHash: graph.snapshotHash,
  };
  return {
    snapshot,
    graph,
    expected,
    globalP0Hold: false,
    reservations: [
      {
        kind: 'reserved',
        identity: expected,
        canonicalItemId: id,
        reservationId,
        owner: 'receiver',
      },
    ],
    grant: {
      identity: expected,
      grantId,
      canonicalItemId: id,
      reservationId,
      owner: 'receiver',
      action: 'compare-and-create',
      allowed: true,
    },
  };
}
function request(current: PlannerContext) {
  return {
    operationId,
    expected: current.expected,
    canonicalItemId: current.grant.canonicalItemId,
    owner: 'receiver',
    grantId,
    reservationId,
  };
}

// Synthetic atomic model only. Maps neither persist nor prove crash safety.
function atomicFixture(readCurrent: () => PlannerContext) {
  const operations = new Map<string, AssignmentReceipt>();
  const tasks = new Map<string, string>();
  const commands: AssignmentCommand[] = [];
  const port: AtomicAssignmentPort = {
    async compareAndCreate(command) {
      commands.push(command);
      const { requestDigest, ...identity } = command;
      if (requestDigest !== digest(identity))
        return { kind: 'conflict', reason: 'invalid-request-digest' };
      const current = validatePlannerContext(readCurrent());
      if (
        !samePlannerIdentity(command.expected, current.expected) ||
        command.grantId !== current.grant.grantId ||
        command.owner !== current.grant.owner ||
        command.reservationId !== current.grant.reservationId ||
        plannerDenial(current, command.canonicalItemId)
      )
        return { kind: 'denied', reason: 'atomic-authority-recheck' };
      const previous = operations.get(command.operationId);
      if (previous)
        return previous.requestDigest === command.requestDigest
          ? { ...previous, kind: 'replayed' }
          : { kind: 'conflict', reason: 'operation-digest-conflict' };
      const key = `${command.expected.sourceDatabaseId}/${command.canonicalItemId}`;
      if (tasks.has(key))
        return { kind: 'conflict', reason: 'source-item-already-assigned' };
      const receipt: AssignmentReceipt = {
        kind: 'created',
        operationId: command.operationId,
        requestDigest: command.requestDigest,
        sourceDatabaseId: command.expected.sourceDatabaseId,
        canonicalItemId: command.canonicalItemId,
        taskId: 'synthetic-task-001',
        receiptId: 'synthetic-receipt-001',
      };
      tasks.set(key, receipt.taskId);
      operations.set(command.operationId, receipt);
      return receipt;
    },
  };
  return { port, commands, tasks, operations };
}

// Synthetic authenticated inspection permission, independent of create admission.
function inspectionFixture(operations: Map<string, AssignmentReceipt>) {
  const principalId = '66666666-6666-4666-8666-666666666666';
  const permission = new Set([`${databaseId}/target/${operationId}`]);
  let reads = 0;
  const readCurrentAuthorization = async (
    scope: AssignmentInspectionScope
  ) => ({
    action: 'assignment-reconcile',
    principal: { id: principalId, authenticated: true },
    scope,
    policy: {
      permission: 'assignment-reconcile',
      allowed: permission.has(
        `${scope.sourceDatabaseId}/${scope.canonicalItemId}/${scope.operationId}`
      ),
    },
  });
  const port: AssignmentReconciliationPort = {
    async readOriginalReceipt({ original, authorization }) {
      const scope = authorization.scope;
      if (
        authorization.principal.id !== principalId ||
        !authorization.principal.authenticated ||
        !permission.has(
          `${original.expected.sourceDatabaseId}/${original.canonicalItemId}/${original.operationId}`
        ) ||
        scope.sourceDatabaseId !== original.expected.sourceDatabaseId ||
        scope.canonicalItemId !== original.canonicalItemId ||
        scope.operationId !== original.operationId
      )
        return { kind: 'denied', reason: 'inspection-policy-denied' };
      reads++;
      const receipt = operations.get(original.operationId);
      if (!receipt) return { kind: 'not-found' };
      if (
        receipt.requestDigest !== original.requestDigest ||
        receipt.sourceDatabaseId !== original.expected.sourceDatabaseId ||
        receipt.canonicalItemId !== original.canonicalItemId
      )
        return { kind: 'conflict', reason: 'original-journal-conflict' };
      return { kind: 'reconciled', receipt };
    },
  };
  return {
    readCurrentAuthorization,
    port,
    permission,
    get reads() {
      return reads;
    },
  };
}

function advanceOwnedContext(current: PlannerContext) {
  const target = current.snapshot.items[0];
  if (!target) throw new Error('missing target');
  target.status = 'active';
  target.owner = 'receiver';
  current.snapshot.events.push({
    seq: 2,
    item_id: target.id,
    at: '2026-10-13T00:00:01Z',
    action: 'update',
    payload: JSON.stringify(target),
  });
  current.snapshot.revision = 2;
  current.graph = buildOutcomeProjectionPage({
    snapshot: current.snapshot,
    limit: 500,
  });
  current.expected = {
    sourceDatabaseId: databaseId,
    revision: 2,
    snapshotHash: current.graph.snapshotHash,
  };
  current.reservations = [
    {
      kind: 'unreserved',
      identity: current.expected,
      canonicalItemId: target.id,
      reservationId,
    },
  ];
  current.grant = {
    ...current.grant,
    identity: current.expected,
    grantId: secondOperationId,
    owner: 'next-owner',
    allowed: false,
  };
  current.globalP0Hold = true;
  validatePlannerContext(current);
}

describe('operational compare-and-create boundary', () => {
  it('R1-1 recovers original receipt after valid revision and ownership progress', async () => {
    const current = context();
    const original = structuredClone(request(current));
    const fixture = atomicFixture(() => current);
    const committed = await compareAndCreateOperationalTask({
      request: original,
      readCurrent: async () => current,
      port: fixture.port,
    });
    advanceOwnedContext(current);
    expect(
      await compareAndCreateOperationalTask({
        request: original,
        readCurrent: async () => current,
        port: fixture.port,
      })
    ).toEqual({ kind: 'denied', reason: 'request-authority-conflict' });
    const inspection = inspectionFixture(fixture.operations);
    const digest = fixture.commands[0]?.requestDigest;
    expect(
      await reconcileOperationalTaskAssignment({
        request: { originalRequest: original, requestDigest: digest },
        readCurrentAuthorization: inspection.readCurrentAuthorization,
        port: inspection.port,
      })
    ).toEqual({ kind: 'reconciled', receipt: committed });
    expect(inspection.reads).toBe(1);
    expect(fixture.commands.length).toBe(1);
  });

  it('concurrent exact replay returns one literal task and receipt', async () => {
    const current = context();
    const fixture = atomicFixture(() => current);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        compareAndCreateOperationalTask({
          request: request(current),
          readCurrent: async () => current,
          port: fixture.port,
        })
      )
    );
    expect(results.map((r) => r.kind)).toEqual([
      'created',
      'replayed',
      'replayed',
      'replayed',
      'replayed',
      'replayed',
      'replayed',
      'replayed',
    ]);
    expect(results.map((r) => ('taskId' in r ? r.taskId : null))).toEqual(
      Array(8).fill('synthetic-task-001')
    );
    expect(results.map((r) => ('receiptId' in r ? r.receiptId : null))).toEqual(
      Array(8).fill('synthetic-receipt-001')
    );
    expect(fixture.tasks.size).toBe(1);
    expect(fixture.operations.size).toBe(1);
  });

  it('different operations cannot create a duplicate task', async () => {
    const current = context();
    const fixture = atomicFixture(() => current);
    const run = (id: string) =>
      compareAndCreateOperationalTask({
        request: { ...request(current), operationId: id },
        readCurrent: async () => current,
        port: fixture.port,
      });
    expect((await run(operationId)).kind).toBe('created');
    expect(await run(secondOperationId)).toEqual({
      kind: 'conflict',
      reason: 'source-item-already-assigned',
    });
    expect(fixture.tasks.size).toBe(1);
  });

  it('changed request replay conflicts even if its new grant is valid', async () => {
    let current = context();
    const fixture = atomicFixture(() => current);
    const run = () =>
      compareAndCreateOperationalTask({
        request: request(current),
        readCurrent: async () => current,
        port: fixture.port,
      });
    expect((await run()).kind).toBe('created');
    current = context('other');
    expect(await run()).toEqual({
      kind: 'conflict',
      reason: 'operation-digest-conflict',
    });
    expect(fixture.tasks.size).toBe(1);
  });

  it.each([
    'stale-db',
    'stale-revision',
    'stale-hash',
    'stale-grant',
    'denied',
    'foreign',
    'unreserved',
    'hold',
    'alias',
    'missing-acceptance',
  ])('%s preflight makes zero port calls', async (mutation) => {
    const current = context('target', mutation === 'hold' ? 1 : 0);
    const input = structuredClone(request(current));
    switch (mutation) {
      case 'stale-db':
        input.expected.sourceDatabaseId =
          '99999999-9999-4999-8999-999999999999';
        break;
      case 'stale-revision':
        input.expected.revision++;
        break;
      case 'stale-hash':
        input.expected.snapshotHash = 'f'.repeat(64);
        break;
      case 'stale-grant':
        current.grant.identity = { ...current.expected, revision: 0 };
        break;
      case 'denied':
        current.grant.allowed = false;
        break;
      case 'foreign':
        current.reservations = current.reservations.map((r) => ({
          ...r,
          kind: 'reserved',
          owner: 'foreign',
        }));
        break;
      case 'unreserved':
        current.reservations = [
          {
            kind: 'unreserved',
            identity: current.expected,
            canonicalItemId: 'target',
            reservationId,
          },
        ];
        break;
      case 'hold':
        current.globalP0Hold = true;
        break;
      case 'alias':
        input.canonicalItemId = 'alias';
        break;
      case 'missing-acceptance':
        if (current.snapshot.items[0])
          current.snapshot.items[0].acceptance = '';
        break;
    }
    const fixture = atomicFixture(() => current);
    expect(
      (
        await compareAndCreateOperationalTask({
          request: input,
          readCurrent: async () => current,
          port: fixture.port,
        })
      ).kind
    ).toBe('denied');
    expect(fixture.commands).toEqual([]);
  });

  it('ignores forged recommendation authority and does not forward it', async () => {
    const current = context();
    const fixture = atomicFixture(() => current);
    const input = {
      ...request(current),
      recommendation: {
        actionAuthorized: true,
        owner: 'foreign',
        score: Infinity,
      },
    };
    const created = await compareAndCreateOperationalTask({
      request: input,
      readCurrent: async () => current,
      port: fixture.port,
    });
    expect(created.kind).toBe('created');
    expect(fixture.commands[0]).not.toHaveProperty('recommendation');
    const replay = await compareAndCreateOperationalTask({
      request: { ...input, recommendation: null },
      readCurrent: async () => current,
      port: fixture.port,
    });
    expect(replay.kind).toBe('replayed');
    current.grant.allowed = false;
    expect(
      (
        await compareAndCreateOperationalTask({
          request: input,
          readCurrent: async () => current,
          port: fixture.port,
        })
      ).kind
    ).toBe('denied');
    expect(fixture.commands.length).toBe(2);
  });

  it.each(['source', 'revision', 'grant', 'reservation', 'hold'])(
    'atomic port rechecks %s changed after preflight',
    async (mutation) => {
      const current = context('target', mutation === 'hold' ? 1 : 0);
      const fixture = atomicFixture(() => current);
      const port: AtomicAssignmentPort = {
        async compareAndCreate(command) {
          switch (mutation) {
            case 'source':
              current.snapshot.sourceDatabaseId =
                '99999999-9999-4999-8999-999999999999';
              break;
            case 'revision':
              current.snapshot.revision = 2;
              current.snapshot.events.push({
                seq: 2,
                item_id: 'target',
                at: '2026-10-13T00:00:01Z',
                action: 'update',
                payload: JSON.stringify(current.snapshot.items[0]),
              });
              break;
            case 'grant':
              current.grant.allowed = false;
              break;
            case 'reservation':
              current.reservations = current.reservations.map((r) => ({
                ...r,
                kind: 'reserved',
                owner: 'foreign',
              }));
              break;
            case 'hold':
              current.globalP0Hold = true;
              break;
          }
          if (mutation === 'source' || mutation === 'revision') {
            current.graph = buildOutcomeProjectionPage({
              snapshot: current.snapshot,
              limit: 500,
            });
            current.expected = {
              sourceDatabaseId: current.snapshot.sourceDatabaseId ?? databaseId,
              revision: current.graph.revision,
              snapshotHash: current.graph.snapshotHash,
            };
            current.grant.identity = current.expected;
            current.reservations = current.reservations.map((r) => ({
              ...r,
              identity: current.expected,
            }));
          }
          return fixture.port.compareAndCreate(command);
        },
      };
      const result = await compareAndCreateOperationalTask({
        request: request(current),
        readCurrent: async () => current,
        port,
      });
      expect(result).toEqual({
        kind: 'denied',
        reason: 'atomic-authority-recheck',
      });
      expect(fixture.tasks.size).toBe(0);
    }
  );

  it('timeout remains unresolved with the original key and no retry', async () => {
    const current = context();
    const commands: AssignmentCommand[] = [];
    const result = await compareAndCreateOperationalTask({
      request: request(current),
      readCurrent: async () => current,
      timeoutMs: 5,
      port: {
        compareAndCreate(command) {
          commands.push(command);
          return new Promise(() => {});
        },
      },
    });
    expect(result).toEqual({
      kind: 'unresolved',
      operationId,
      requestDigest: commands[0]?.requestDigest,
    });
    expect(commands.map((c) => c.operationId)).toEqual([operationId]);
  });

  it('mismatched receipt is unresolved', async () => {
    const current = context();
    const result = await compareAndCreateOperationalTask({
      request: request(current),
      readCurrent: async () => current,
      port: {
        async compareAndCreate(command) {
          return {
            kind: 'created',
            operationId: secondOperationId,
            requestDigest: command.requestDigest,
            sourceDatabaseId: databaseId,
            canonicalItemId: 'target',
            taskId: 'forged-task',
            receiptId: 'forged-receipt',
          };
        },
      },
    });
    expect(result.kind).toBe('unresolved');
  });

  it('a late commit after timeout reconciles with the same operation and receipt', async () => {
    const current = context();
    const original = structuredClone(request(current));
    const fixture = atomicFixture(() => current);
    let finish = () => {};
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let pending: Promise<unknown> | undefined;
    let calls = 0;
    const unresolved = await compareAndCreateOperationalTask({
      request: original,
      readCurrent: async () => current,
      timeoutMs: 5,
      port: {
        compareAndCreate(command) {
          calls++;
          pending = gate.then(() => fixture.port.compareAndCreate(command));
          return pending;
        },
      },
    });
    expect(unresolved.kind).toBe('unresolved');
    expect(calls).toBe(1);
    finish();
    await pending;
    advanceOwnedContext(current);
    const inspection = inspectionFixture(fixture.operations);
    const replay = await reconcileOperationalTaskAssignment({
      request: {
        originalRequest: original,
        requestDigest: fixture.commands[0]?.requestDigest,
      },
      readCurrentAuthorization: inspection.readCurrentAuthorization,
      port: inspection.port,
    });
    expect(replay).toEqual({
      kind: 'reconciled',
      receipt: {
        kind: 'created',
        operationId,
        requestDigest: fixture.commands[0]?.requestDigest,
        sourceDatabaseId: databaseId,
        canonicalItemId: 'target',
        taskId: 'synthetic-task-001',
        receiptId: 'synthetic-receipt-001',
      },
    });
    expect(fixture.tasks.size).toBe(1);
    expect(fixture.commands.length).toBe(1);
  });
});
