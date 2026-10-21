import { beforeEach, expect, it, vi } from 'vitest';
import { EmployeeCreationRecovery } from './employee-creation-recovery';

const actorId = '10000000-0000-4000-8000-000000000001';
const operationId = '10000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-0000-0000-000000000000';
const eligible = {
  status: 'eligible' as const,
  expectedVersion: 2 as const,
  actorUserId: actorId,
  operationId,
  targetUserId: '10000000-0000-4000-8000-000000000003',
  originalLeaseId: '10000000-0000-4000-8000-000000000004',
  originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
  email: 'hehe@tuturuuu.com',
  displayName: 'Hehe',
};
const inspect = vi.fn();
const mutate = vi.fn();
function session(workspace = workspaceId) {
  const recovery = new EmployeeCreationRecovery({
    actorId,
    workspaceId: workspace,
    storage: sessionStorage,
    assertActive() {},
    inspectRejection: inspect,
    adjudicateRejection: mutate,
  });
  recovery.activate();
  return recovery;
}
beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  inspect.mockReset();
  mutate.mockReset();
  inspect.mockResolvedValue(eligible);
});
it('loads only the authenticated original identity without a mutation or UUID generation', async () => {
  const uuid = vi.spyOn(crypto, 'randomUUID');
  const recovery = session();
  const result = await recovery.resumeOriginal(operationId);
  expect(result).toMatchObject({
    operationId,
    email: eligible.email,
    state: 'stopped',
    rejection: null,
  });
  expect(uuid).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
  expect(() => recovery.prepare(eligible)).toThrow('Unresolved');
});
it('loads the exact committed audit and permits only that original retry', async () => {
  const audit = {
    ...eligible,
    status: 'retry_ready',
    expectedVersion: 3,
    eventId: '10000000-0000-4000-8000-000000000006',
    evidenceReferenceSha256: 'a'.repeat(64),
  };
  inspect.mockResolvedValue(audit);
  const recovery = session();
  await recovery.resumeOriginal(operationId);
  await recovery.inspectRejection();
  expect(recovery.prepare(eligible).operationId).toBe(operationId);
  expect(recovery.reference?.rejection).toMatchObject({
    eventId: audit.eventId,
    targetUserId: eligible.targetUserId,
  });
  expect(mutate).not.toHaveBeenCalled();
});
it.each([
  { ...eligible, actorUserId: eligible.targetUserId },
  { ...eligible, operationId: eligible.targetUserId },
  { status: 'fenced', operationId },
  { ...eligible, expectedVersion: 9 },
])(
  'rejects foreign, mismatched, fenced or malformed readbacks',
  async (result) => {
    inspect.mockResolvedValue(result);
    const recovery = session();
    await expect(recovery.resumeOriginal(operationId)).rejects.toThrow();
    expect(sessionStorage.getItem(recovery.key)).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  }
);
it('denies non-root scope, retained references and unavailable storage', async () => {
  await expect(session(actorId).resumeOriginal(operationId)).rejects.toThrow();
  const recovery = session();
  recovery.prepare(eligible);
  const before = sessionStorage.getItem(recovery.key);
  await expect(recovery.resumeOriginal(operationId)).rejects.toThrow();
  expect(sessionStorage.getItem(recovery.key)).toBe(before);
  sessionStorage.clear();
  const other = session();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  await expect(other.resumeOriginal(operationId)).rejects.toThrow('blocked');
  expect(other.reference?.state).toBe('stopped');
});
it('rejects concurrent load, stale sessions and a reference appearing during GET', async () => {
  let finish = () => {};
  inspect.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(eligible);
      })
  );
  const recovery = session();
  const first = recovery.resumeOriginal(operationId);
  expect(() => recovery.prepare(eligible)).toThrow('load in flight');
  await expect(recovery.resumeOriginal(operationId)).rejects.toThrow();
  recovery.retire();
  finish();
  await expect(first).rejects.toThrow('retired');
  expect(sessionStorage.getItem(recovery.key)).toBeNull();
  const next = session();
  const pending = next.resumeOriginal(operationId);
  const retained = session().prepare(eligible);
  finish();
  await expect(pending).rejects.toThrow('retained');
  expect(JSON.parse(sessionStorage.getItem(next.key) ?? '{}').operationId).toBe(
    retained.operationId
  );
});
