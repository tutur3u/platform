import { describe, expect, it } from 'vitest';
import { digest, type Item } from '../cli/operational-schema';
import { buildOutcomeProjectionPage } from '../operational-graph/projection';
import { reconcileOperationalTaskAssignment } from './assignment';
import type {
  AssignmentInspectionScope,
  AssignmentReceipt,
  AssignmentReconciliationCommand,
  PlannerContext,
} from './contracts';
import { planOperationalWork } from './planner';

const databaseId = '11111111-1111-4111-8111-111111111111';
const reservationId = '22222222-2222-4222-8222-222222222222';
const grantId = '33333333-3333-4333-8333-333333333333';
function item(id: string, priority: number): Item {
  return {
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
}
function context(items: Item[]): PlannerContext {
  const snapshot = {
    sourceDatabaseId: databaseId,
    revision: items.length,
    items,
    events: items.map((item, index) => ({
      seq: index + 1,
      item_id: item.id,
      at: '2026-10-13T00:00:00Z',
      action: 'intake',
      payload: JSON.stringify(item),
    })),
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
    reservations: items.map((item, index) => ({
      kind: 'reserved',
      identity: expected,
      canonicalItemId: item.id,
      reservationId:
        index === 0
          ? reservationId
          : `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
      owner: 'receiver',
    })),
    grant: {
      identity: expected,
      grantId,
      canonicalItemId: items[0]?.id ?? 'missing',
      reservationId,
      owner: 'receiver',
      action: 'compare-and-create',
      allowed: true,
    },
  };
}

describe('operational advisory planner', () => {
  it('keeps P0 ahead of a high-scoring P1 and ties by canonical id', () => {
    const plan = planOperationalWork({
      context: context([
        item('pzero', 0),
        item('pone-z', 1),
        item('pone-a', 1),
        item('pone-high', 1),
      ]),
      scores: [
        { canonicalItemId: 'pzero', score: -100 },
        { canonicalItemId: 'pone-high', score: 999_999 },
      ],
    });
    expect(plan.candidates.map((c) => c.canonicalItemId)).toEqual([
      'pzero',
      'pone-high',
      'pone-a',
      'pone-z',
    ]);
    expect(plan.candidates.map((c) => c.actionAuthorized)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(plan.actionAuthorized).toBe(false);
    expect(plan.liveVerificationPerformed).toBe(false);
  });

  it('denies non-P0 during the global hold', () => {
    const current = context([item('pone', 1)]);
    current.globalP0Hold = true;
    expect(planOperationalWork({ context: current }).candidates).toEqual([
      {
        canonicalItemId: 'pone',
        priority: 1,
        advisoryScore: 0,
        denial: 'global-p0-hold',
        actionAuthorized: false,
      },
    ]);
  });

  it('denies pending dependencies even for a legacy ready item', () => {
    const target = item('target', 0);
    target.dependencies = ['dependency'];
    target.status = 'ready';
    expect(
      planOperationalWork({
        context: context([target, item('dependency', 0)]),
      }).candidates.find((c) => c.canonicalItemId === 'target')?.denial
    ).toBe('dependency-pending');
  });

  it('reuses current-head dependency evidence validation', () => {
    const dependency = item('dependency', 0);
    dependency.status = 'verified';
    const head = 'a'.repeat(40);
    dependency.verification = {
      version: 1,
      units: [
        {
          id: 'dependency',
          owner: 'supplier',
          worktree: '/synthetic',
          head,
          state: 'delivered',
          requiredEvidence: ['test'],
          evidence: [
            { kind: 'test', head, result: 'pass', receipt: 'synthetic-pass' },
          ],
        },
      ],
    };
    const target = item('target', 0);
    target.dependencies = ['dependency'];
    const current = context([target, dependency]);
    expect(
      planOperationalWork({ context: current }).candidates.find(
        (c) => c.canonicalItemId === 'target'
      )?.denial
    ).toBeNull();
    const stale = structuredClone(current);
    const unit = stale.snapshot.items[1]?.verification?.units[0];
    if (!unit) throw new Error('fixture missing evidence');
    unit.evidence = [
      { kind: 'test', head: 'b'.repeat(40), result: 'pass', receipt: 'stale' },
    ];
    const event = stale.snapshot.events[1];
    if (!event) throw new Error('fixture missing event');
    event.payload = JSON.stringify(stale.snapshot.items[1]);
    expect(() => planOperationalWork({ context: stale })).toThrow(
      'current-head'
    );
  });

  it.each([
    'database',
    'revision',
    'hash',
    'grant',
    'reservation',
    'partial',
    'alias',
    'legacy',
    'acceptance',
    'history',
  ])('rejects %s input', (mutation) => {
    const current = structuredClone(
      context([item('target', 0), item('other', 1)])
    );
    switch (mutation) {
      case 'database':
        current.expected.sourceDatabaseId =
          '99999999-9999-4999-8999-999999999999';
        break;
      case 'revision':
        current.expected.revision++;
        break;
      case 'hash':
        current.expected.snapshotHash = 'f'.repeat(64);
        break;
      case 'grant':
        current.grant.identity = { ...current.expected, revision: 0 };
        break;
      case 'reservation':
        current.reservations = [];
        break;
      case 'partial':
        current.graph = buildOutcomeProjectionPage({
          snapshot: current.snapshot,
          limit: 1,
        });
        break;
      case 'alias':
        current.graph = {
          ...current.graph,
          records: current.graph.records.map((r) => ({
            ...r,
            canonicalId: 'alias',
          })),
        };
        break;
      case 'legacy':
        current.snapshot.sourceDatabaseId = null;
        break;
      case 'acceptance':
        if (current.snapshot.items[0])
          current.snapshot.items[0].acceptance = '';
        break;
      case 'history':
        current.snapshot.events = [];
        break;
    }
    expect(() => planOperationalWork({ context: current })).toThrow();
  });

  it('rejects missing explicit priority/dependencies and alias scores', () => {
    const current = context([item('target', 0)]);
    if (current.snapshot.items[0]) delete current.snapshot.items[0].priority;
    expect(() => planOperationalWork({ context: current })).toThrow('explicit');
    expect(() =>
      planOperationalWork({
        context: context([item('target', 0)]),
        scores: [{ canonicalItemId: 'alias', score: 1 }],
      })
    ).toThrow('canonical');
  });
});

// This auth map and journal are synthetic, not durable authentication or storage.
function inspectionHarness() {
  const current = context([item('target', 0)]);
  const originalRequest = {
    operationId: '44444444-4444-4444-8444-444444444444',
    expected: structuredClone(current.expected),
    canonicalItemId: 'target',
    owner: 'receiver',
    grantId,
    reservationId,
  };
  const requestDigest = digest(originalRequest);
  const receipt: AssignmentReceipt = {
    kind: 'created',
    operationId: originalRequest.operationId,
    requestDigest,
    sourceDatabaseId: databaseId,
    canonicalItemId: 'target',
    taskId: 'original-task-001',
    receiptId: 'original-receipt-001',
  };
  const principalId = '66666666-6666-4666-8666-666666666666';
  const key = (scope: AssignmentInspectionScope) =>
    `${scope.sourceDatabaseId}/${scope.canonicalItemId}/${scope.operationId}`;
  const permissions = new Set([
    key({
      sourceDatabaseId: databaseId,
      canonicalItemId: 'target',
      operationId: originalRequest.operationId,
    }),
  ]);
  const journal = new Map([[originalRequest.operationId, receipt]]);
  const state = { authenticated: true, allowed: true };
  const metrics = { reads: 0, portCalls: 0, createCalls: 0 };
  const readCurrentAuthorization = async (
    scope: AssignmentInspectionScope
  ) => ({
    action: 'assignment-reconcile',
    principal: { id: principalId, authenticated: state.authenticated },
    scope,
    policy: {
      permission: 'assignment-reconcile',
      allowed: state.allowed && permissions.has(key(scope)),
    },
  });
  const port = {
    async compareAndCreate() {
      metrics.createCalls++;
      throw new Error('read must never create');
    },
    async readOriginalReceipt({
      original,
      authorization,
    }: AssignmentReconciliationCommand) {
      metrics.portCalls++;
      const scope = {
        sourceDatabaseId: original.expected.sourceDatabaseId,
        canonicalItemId: original.canonicalItemId,
        operationId: original.operationId,
      };
      // Independent current transport/session and scoped policy check BEFORE lookup.
      if (
        !state.authenticated ||
        !state.allowed ||
        authorization.principal.id !== principalId ||
        !permissions.has(key(scope)) ||
        key(authorization.scope) !== key(scope)
      )
        return { kind: 'denied', reason: 'port-inspection-policy-denied' };
      metrics.reads++;
      const stored = journal.get(original.operationId);
      if (!stored) return { kind: 'not-found' };
      if (
        stored.operationId !== original.operationId ||
        stored.requestDigest !== original.requestDigest ||
        stored.sourceDatabaseId !== scope.sourceDatabaseId ||
        stored.canonicalItemId !== scope.canonicalItemId
      )
        return { kind: 'conflict', reason: 'original-journal-conflict' };
      return { kind: 'reconciled', receipt: structuredClone(stored) };
    },
  };
  return {
    request: { originalRequest, requestDigest },
    receipt,
    readCurrentAuthorization,
    port,
    journal,
    permissions,
    state,
    metrics,
  };
}

describe('read-only assignment reconciliation', () => {
  it('reads only the original digest and IDs; recommendation cannot grant authority', async () => {
    const h = inspectionHarness();
    const request = {
      ...h.request,
      originalRequest: {
        ...h.request.originalRequest,
        recommendation: { actionAuthorized: true, owner: 'intruder' },
      },
    };
    const before = digest(Object.fromEntries(h.journal));
    expect(
      await reconcileOperationalTaskAssignment({
        request,
        readCurrentAuthorization: h.readCurrentAuthorization,
        port: h.port,
      })
    ).toEqual({ kind: 'reconciled', receipt: h.receipt });
    expect(h.metrics).toEqual({ reads: 1, portCalls: 1, createCalls: 0 });
    expect(digest(Object.fromEntries(h.journal))).toBe(before);
    h.state.allowed = false;
    expect(
      (
        await reconcileOperationalTaskAssignment({
          request,
          readCurrentAuthorization: h.readCurrentAuthorization,
          port: h.port,
        })
      ).kind
    ).toBe('denied');
    expect(h.metrics.portCalls).toBe(1);
  });

  it('changed digest conflicts locally; changed original tuple conflicts with journal without effects', async () => {
    const h = inspectionHarness();
    expect(
      await reconcileOperationalTaskAssignment({
        request: { ...h.request, requestDigest: 'f'.repeat(64) },
        readCurrentAuthorization: h.readCurrentAuthorization,
        port: h.port,
      })
    ).toEqual({ kind: 'conflict', reason: 'original-request-digest-conflict' });
    expect(h.metrics.portCalls).toBe(0);
    const originalRequest = {
      ...h.request.originalRequest,
      owner: 'new-owner',
      expected: { ...h.request.originalRequest.expected, revision: 2 },
      reservationId: '77777777-7777-4777-8777-777777777777',
    };
    expect(
      await reconcileOperationalTaskAssignment({
        request: { originalRequest, requestDigest: digest(originalRequest) },
        readCurrentAuthorization: h.readCurrentAuthorization,
        port: h.port,
      })
    ).toEqual({ kind: 'conflict', reason: 'original-journal-conflict' });
    expect(h.journal.get(h.receipt.operationId)).toEqual(h.receipt);
    expect(h.metrics.createCalls).toBe(0);
  });

  it('authorized absent journal truthfully returns not-found and never creates', async () => {
    const h = inspectionHarness();
    h.journal.clear();
    expect(
      await reconcileOperationalTaskAssignment({
        request: h.request,
        readCurrentAuthorization: h.readCurrentAuthorization,
        port: h.port,
      })
    ).toEqual({ kind: 'not-found' });
    expect(h.journal.size).toBe(0);
    expect(h.metrics).toEqual({ reads: 1, portCalls: 1, createCalls: 0 });
  });

  it.each([
    'unauthenticated',
    'policy-deny',
    'database',
    'item',
    'operation',
    'action',
    'malformed',
  ])(
    '%s inspection authority denies before journal access',
    async (mutation) => {
      const h = inspectionHarness();
      const readCurrentAuthorization = async (
        scope: AssignmentInspectionScope
      ) => {
        const auth = await h.readCurrentAuthorization(scope);
        switch (mutation) {
          case 'unauthenticated':
            auth.principal.authenticated = false;
            break;
          case 'policy-deny':
            auth.policy.allowed = false;
            break;
          case 'database':
            auth.scope = {
              ...scope,
              sourceDatabaseId: '99999999-9999-4999-8999-999999999999',
            };
            break;
          case 'item':
            auth.scope = { ...scope, canonicalItemId: 'other' };
            break;
          case 'operation':
            auth.scope = {
              ...scope,
              operationId: '88888888-8888-4888-8888-888888888888',
            };
            break;
          case 'action':
            return { ...auth, action: 'compare-and-create' };
          case 'malformed':
            return { ...auth, untrusted: true };
        }
        return auth;
      };
      expect(
        (
          await reconcileOperationalTaskAssignment({
            request: h.request,
            readCurrentAuthorization,
            port: h.port,
          })
        ).kind
      ).toBe('denied');
      expect(h.metrics).toEqual({ reads: 0, portCalls: 0, createCalls: 0 });
      expect(h.journal.get(h.receipt.operationId)).toEqual(h.receipt);
    }
  );

  it.each(['policy', 'transport'])(
    'read port independently denies %s revocation before revealing existence',
    async (boundary) => {
      const h = inspectionHarness();
      const port = {
        ...h.port,
        async readOriginalReceipt(command: AssignmentReconciliationCommand) {
          if (boundary === 'policy') h.state.allowed = false;
          else h.state.authenticated = false;
          return h.port.readOriginalReceipt(command);
        },
      };
      expect(
        await reconcileOperationalTaskAssignment({
          request: h.request,
          readCurrentAuthorization: h.readCurrentAuthorization,
          port,
        })
      ).toEqual({ kind: 'denied', reason: 'port-inspection-policy-denied' });
      expect(h.metrics).toEqual({ reads: 0, portCalls: 1, createCalls: 0 });
    }
  );

  it.each(['operation', 'digest', 'database', 'item', 'malformed'])(
    '%s receipt is unresolved with original identity',
    async (mutation) => {
      const h = inspectionHarness();
      const receipt = { ...h.receipt };
      switch (mutation) {
        case 'operation':
          receipt.operationId = '88888888-8888-4888-8888-888888888888';
          break;
        case 'digest':
          receipt.requestDigest = 'f'.repeat(64);
          break;
        case 'database':
          receipt.sourceDatabaseId = '99999999-9999-4999-8999-999999999999';
          break;
        case 'item':
          receipt.canonicalItemId = 'other';
          break;
      }
      const port = {
        ...h.port,
        async readOriginalReceipt() {
          return mutation === 'malformed'
            ? { kind: 'reconciled', receipt: { ...receipt, taskId: '' } }
            : { kind: 'reconciled', receipt };
        },
      };
      expect(
        await reconcileOperationalTaskAssignment({
          request: h.request,
          readCurrentAuthorization: h.readCurrentAuthorization,
          port,
        })
      ).toEqual({
        kind: 'unresolved',
        operationId: h.receipt.operationId,
        requestDigest: h.receipt.requestDigest,
      });
      expect(h.metrics.createCalls).toBe(0);
    }
  );

  it.each(['authorization', 'journal'])(
    '%s timeout is unresolved with no new-key retry',
    async (boundary) => {
      const h = inspectionHarness();
      let calls = 0;
      const never = () => {
        calls++;
        return new Promise<never>(() => {});
      };
      expect(
        await reconcileOperationalTaskAssignment({
          request: h.request,
          timeoutMs: 5,
          readCurrentAuthorization:
            boundary === 'authorization' ? never : h.readCurrentAuthorization,
          port:
            boundary === 'journal'
              ? { ...h.port, readOriginalReceipt: never }
              : h.port,
        })
      ).toEqual({
        kind: 'unresolved',
        operationId: h.receipt.operationId,
        requestDigest: h.receipt.requestDigest,
      });
      expect(calls).toBe(1);
      expect(h.metrics.createCalls).toBe(0);
      expect(h.journal.get(h.receipt.operationId)).toEqual(h.receipt);
    }
  );

  it('late authorization after timeout never starts a journal read', async () => {
    const h = inspectionHarness();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const result = await reconcileOperationalTaskAssignment({
      request: h.request,
      timeoutMs: 5,
      readCurrentAuthorization: async (scope) => {
        await gate;
        return h.readCurrentAuthorization(scope);
      },
      port: h.port,
    });
    expect(result.kind).toBe('unresolved');
    release();
    await gate;
    await Promise.resolve();
    await Promise.resolve();
    expect(h.metrics).toEqual({ reads: 0, portCalls: 0, createCalls: 0 });
  });
});
