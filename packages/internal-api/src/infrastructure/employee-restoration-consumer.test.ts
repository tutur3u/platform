import type { EmployeeRestoreTuple } from '@tuturuuu/utils/internal-accounts/employee-restoration-boundary';
import { makeEmployeeRestorationHandlers } from '@tuturuuu/utils/internal-accounts/employee-restoration-http';
import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from '../client';
import {
  getInternalEmployeeManagement,
  type InternalEmployeeManagement,
  reconcileInternalEmployee,
} from './employee-management';
import { restoreInternalEmployee } from './employee-restoration';

import { EmployeeRestorationConsumer } from './employee-restoration-consumer';

vi.mock('server-only', () => ({}));

const id = '10000000-0000-4000-8000-000000000001';
const operationId = '20000000-0000-4000-8000-000000000001';
const email = 'staff@tuturuuu.com';
const detail: InternalEmployeeManagement = {
  id,
  email,
  registryState: 'active',
  managedName: 'Staff',
  managementRoleLabel: null,
  revision: 7,
  mailboxReady: true,
  readinessCode: 'ready',
  reservation: 'exact_intent',
  managed: true,
  operation: null,
  recovery: null,
  providerState: 'confirmed_banned',
  providerReadAt: '2026-10-16T00:00:00Z',
  nextAction: 'restore',
};
const pending = {
  status: 'pending',
  operationId,
  code: 'employee_restore_outcome_unknown',
  nextAction: 'inspect',
  message: 'pending',
} as const;
const completed: InternalEmployeeManagement = {
  ...detail,
  revision: 8,
  providerState: 'confirmed_active',
  nextAction: 'none',
  operation: { operationId, revision: 7, phase: 'completed' },
};
function setup(initial = detail) {
  const transport = {
    inspect: vi.fn().mockResolvedValue(initial),
    restore: vi.fn().mockResolvedValue(pending),
    reconcile: vi.fn().mockResolvedValue(pending),
  };
  const assertActive = vi.fn();
  const consumer = new EmployeeRestorationConsumer({
    targetId: id,
    email,
    assertActive,
    transport,
  });
  return { consumer, transport, assertActive };
}
describe('restoration consumer', () => {
  it.each([
    'none',
    'adoption_required',
    'creation_reconciliation_required',
    'manual_review',
  ] as const)('offers no restore for %s', async (nextAction) => {
    const { consumer, transport } = setup({ ...detail, nextAction });
    await consumer.inspect();
    expect(consumer.action).toBeNull();
    await consumer.submit(email);
    expect(transport.restore).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'missing', 'unconfirmed', 'confirmed_active'] as const)(
    'rejects inconsistent restore instruction for provider %s',
    async (providerState) => {
      const { consumer } = setup({ ...detail, providerState });
      await consumer.inspect();
      expect(consumer.action).toBeNull();
    }
  );
  it('requires exact email and fresh unchanged revision before the sole write', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    await consumer.submit('other@tuturuuu.com');
    expect(transport.restore).not.toHaveBeenCalled();
    transport.inspect.mockResolvedValue({ ...detail, revision: 9 });
    await consumer.submit(email);
    expect(transport.restore).not.toHaveBeenCalled();
    expect(consumer.view.outcome).toBe('conflict');
  });
  it('retains original UUID and revision after acknowledgement loss; reconcile never restores', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    transport.inspect.mockResolvedValueOnce(detail).mockResolvedValue({
      ...detail,
      revision: 8,
      nextAction: 'inspect',
      operation: { operationId, revision: 7, phase: 'unknown' },
    });
    await consumer.submit(email);
    expect(transport.restore).toHaveBeenCalledExactlyOnceWith(id, {
      confirmationEmail: email,
      expectedRevision: 7,
    });
    expect(consumer.view.outcome).toBe('pending');
    expect(consumer.action).toBe('reconcile');
    transport.reconcile.mockRejectedValue(new Error('lost response'));
    await consumer.submit(email);
    expect(transport.reconcile).toHaveBeenCalledExactlyOnceWith(id, {
      confirmationEmail: email,
      expectedRevision: 7,
      operationId,
    });
    expect(consumer.view.retained?.operationId).toBe(operationId);
    expect(transport.restore).toHaveBeenCalledTimes(1);
    await consumer.inspect();
    await consumer.submit(email);
    expect(transport.restore).toHaveBeenCalledTimes(1);
  });
  it('does not mistake a lost POST or absent operation for permission to replay', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    transport.restore.mockRejectedValue(new TypeError('lost'));
    await consumer.submit(email);
    await consumer.inspect();
    expect(consumer.view.outcome).toBe('pending');
    expect(consumer.action).toBeNull();
    await consumer.submit(email);
    expect(transport.restore).toHaveBeenCalledTimes(1);
  });
  it('adopts the persisted original operation after a lost POST without generating a UUID', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    transport.restore.mockRejectedValue(new Error('lost'));
    await consumer.submit(email);
    transport.inspect.mockResolvedValue({
      ...detail,
      nextAction: 'inspect',
      operation: { operationId, revision: 7, phase: 'attempted' },
    });
    await consumer.inspect();
    await consumer.submit(email);
    expect(transport.reconcile).toHaveBeenCalledExactlyOnceWith(id, {
      confirmationEmail: email,
      expectedRevision: 7,
      operationId,
    });
    expect(transport.restore).toHaveBeenCalledTimes(1);
  });
  it('does not trust a restored reply without matching independent persisted readback', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    transport.restore.mockResolvedValue({
      status: 'restored',
      account: { id, email, displayName: 'Staff' },
      operationId,
      revision: 8,
    });
    await consumer.submit(email);
    expect(consumer.view.outcome).toBe('pending');
    transport.inspect.mockResolvedValue(completed);
    await consumer.inspect();
    expect(consumer.view.outcome).toBe('restored');
    expect(consumer.action).toBeNull();
  });
  it('reconciles an existing persisted operation using its original revision', async () => {
    const { consumer, transport } = setup({
      ...completed,
      nextAction: 'inspect',
      operation: { operationId, revision: 7, phase: 'unknown' },
    });
    await consumer.inspect();
    await consumer.submit(email);
    expect(transport.reconcile).toHaveBeenCalledExactlyOnceWith(id, {
      confirmationEmail: email,
      expectedRevision: 7,
      operationId,
    });
    expect(transport.restore).not.toHaveBeenCalled();
  });
  it('honors unavailable capability even when later GET still suggests restore', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    transport.restore.mockRejectedValue(
      new InternalApiError(
        'Unavailable',
        503,
        'employee_management_unavailable'
      )
    );
    await consumer.submit(email);
    await consumer.inspect();
    expect(consumer.view.outcome).toBe('unavailable');
    expect(consumer.action).toBeNull();
    expect(transport.restore).toHaveBeenCalledTimes(1);
  });
  it('revocation during preflight prevents dispatch and disclosure', async () => {
    const { consumer, transport, assertActive } = setup();
    await consumer.inspect();
    transport.inspect.mockImplementation(async () => {
      assertActive.mockImplementation(() => {
        throw new Error('retired');
      });
      return detail;
    });
    await expect(consumer.submit(email)).rejects.toThrow('retired');
    expect(transport.restore).not.toHaveBeenCalled();
  });
  it('serializes rapid duplicate submissions', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    await Promise.all([consumer.submit(email), consumer.submit(email)]);
    expect(transport.restore).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed inspection and never claims absence', async () => {
    const { consumer, transport } = setup();
    transport.inspect.mockResolvedValue({ ...detail, providerState: 'bogus' });
    await consumer.inspect();
    expect(consumer.view.detail).toBeNull();
    expect(consumer.view.outcome).toBe('conflict');
  });
  it('retains original UUID when readback unexpectedly names a different operation', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    await consumer.submit(email);
    transport.inspect.mockResolvedValue({
      ...completed,
      operation: { ...completed.operation, operationId: id },
    });
    await consumer.inspect();
    expect(consumer.view.outcome).toBe('pending');
    expect(consumer.view.retained?.operationId).toBe(operationId);
    expect(consumer.view.detail).toBeNull();
  });
  it('withholds reconciliation when fresh state requires manual review', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    await consumer.submit(email);
    transport.inspect.mockResolvedValue({
      ...detail,
      nextAction: 'manual_review',
      readinessCode: 'tuple_conflict',
      operation: { operationId, revision: 7, phase: 'unknown' },
    });
    await consumer.inspect();
    await consumer.submit(email);
    expect(consumer.action).toBeNull();
    expect(transport.reconcile).not.toHaveBeenCalled();
  });
  it('withdraws success if a later readback contradicts completion', async () => {
    const { consumer, transport } = setup();
    await consumer.inspect();
    transport.inspect
      .mockResolvedValueOnce(detail)
      .mockResolvedValue(completed);
    await consumer.submit(email);
    expect(consumer.view.outcome).toBe('restored');
    transport.inspect.mockResolvedValue({
      ...completed,
      providerState: 'confirmed_banned',
      nextAction: 'manual_review',
    });
    await consumer.inspect();
    expect(consumer.view.outcome).toBe('pending');
    expect(consumer.action).toBeNull();
  });
});

it('keeps explicit revision conflict visible with original recovery tuple and no subsequent mutation', async () => {
  const { consumer, transport } = setup();
  await consumer.inspect();
  transport.restore.mockRejectedValue(
    new InternalApiError(
      'Conflict',
      409,
      'employee_revision_or_operation_conflict'
    )
  );
  await consumer.submit(email);
  expect(consumer.view).toMatchObject({
    outcome: 'conflict',
    restoreAttempted: true,
    retained: { confirmationEmail: email, expectedRevision: 7 },
  });
  transport.inspect.mockResolvedValue({
    ...detail,
    nextAction: 'inspect',
    operation: { operationId, revision: 7, phase: 'reserved' },
  });
  await consumer.inspect();
  expect(consumer.view.outcome).toBe('conflict');
  expect(consumer.action).toBeNull();
  await consumer.submit(email);
  expect(transport.restore).toHaveBeenCalledTimes(1);
  expect(transport.reconcile).not.toHaveBeenCalled();
});

it.each(['revision-conflict', 'lost-begin-ACK', 'lost-attempt-ACK'] as const)(
  'real restore service/client/consumer preserves %s with zero unban',
  async (fault) => {
    const actorUserId = '30000000-0000-4000-8000-000000000001';
    const provider = {
      getUserById: vi.fn(async (userId: string) => ({
        data: {
          user: {
            id: userId,
            email,
            aud: 'authenticated',
            created_at: '2026-01-01',
            email_confirmed_at: '2026-01-01',
            app_metadata: { employee_onboarding: true },
            user_metadata: {},
            banned_until: userId === id ? '2126-01-01' : undefined,
          },
        },
        error: null,
      })),
      updateUserById: vi.fn(),
    };
    let original: EmployeeRestoreTuple | null = null;
    const operations = {
      inspect: vi.fn(async () => ({
        data: {
          id,
          email,
          registryState: 'active',
          managedName: 'Staff',
          managementRoleLabel: null,
          revision: fault === 'revision-conflict' ? 8 : 7,
          mailboxReady: true,
          readinessCode: 'ready',
          reservation: 'exact_intent',
          managed: true,
          operation: null,
          recovery: null,
        },
        error: null,
      })),
      begin: vi.fn(async (tuple: EmployeeRestoreTuple) => {
        original = tuple;
        if (fault === 'lost-begin-ACK')
          throw new Error('begin committed, ACK lost');
        return {
          data: {
            operationId: tuple.operationId,
            revision: tuple.expectedRevision,
            phase: 'reserved',
          },
          error: null,
        };
      }),
      markAttempt: vi.fn(async () => {
        throw new Error('attempt committed, ACK lost');
      }),
      confirm: vi.fn(),
      reconcile: vi.fn(),
    };
    const handlers = makeEmployeeRestorationHandlers(async () => ({
      authorized: true,
      input: { actorUserId, provider, operations },
    }));
    const replies: unknown[] = [];
    const http = vi.fn<typeof fetch>(async (url, init) => {
      if (!init?.method || init.method === 'GET') return Response.json(detail);
      const response = await handlers.restore(new Request(url, init), {
        params: Promise.resolve({ userId: id }),
      });
      replies.push(await response.clone().json());
      return response;
    });
    const options = { fetch: http, baseUrl: 'https://web.test' };
    const consumer = new EmployeeRestorationConsumer({
      targetId: id,
      email,
      assertActive: () => {},
      transport: {
        inspect: (target) => getInternalEmployeeManagement(target, options),
        restore: (target, input) =>
          restoreInternalEmployee(target, input, options),
        reconcile: (target, input) =>
          reconcileInternalEmployee(target, input, options),
      },
    });
    await consumer.inspect();
    await consumer.submit(email);
    expect(consumer.view.outcome, JSON.stringify(replies)).toBe(
      fault === 'revision-conflict' ? 'conflict' : 'pending'
    );
    expect(consumer.view.retained).toMatchObject({
      confirmationEmail: email,
      expectedRevision: 7,
    });
    if (fault === 'revision-conflict') {
      expect(original).toBeNull();
      expect(operations.begin).not.toHaveBeenCalled();
    } else {
      expect(original).toMatchObject({
        actorUserId,
        targetUserId: id,
        email,
        expectedRevision: 7,
        operationId: consumer.view.retained?.operationId,
      });
      expect(operations.begin).toHaveBeenCalledTimes(1);
    }
    expect(operations.markAttempt).toHaveBeenCalledTimes(
      fault === 'lost-attempt-ACK' ? 1 : 0
    );
    expect(provider.updateUserById).not.toHaveBeenCalled();
    await consumer.inspect();
    await consumer.submit(email);
    expect(
      http.mock.calls.filter(([, init]) => init?.method === 'POST')
    ).toHaveLength(1);
    expect(operations.reconcile).not.toHaveBeenCalled();
    expect(provider.updateUserById).not.toHaveBeenCalled();
  }
);
