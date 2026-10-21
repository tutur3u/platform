import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { EmployeeRejectionRecoveryState } from '@tuturuuu/internal-api/infrastructure';
import { beforeEach, expect, it, vi } from 'vitest';
import { EmployeeCreationRecovery } from './employee-creation-recovery';

const actorId = '10000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-0000-0000-000000000000';
const payload = {
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  temporaryPassword: 'do-not-retain-123',
};
let time = 1000;
const observe = vi.fn();
const active = vi.fn();
function session(actor = actorId, workspace = workspaceId) {
  const result = new EmployeeCreationRecovery({
    actorId: actor,
    workspaceId: workspace,
    storage: sessionStorage,
    assertActive: active,
    now: () => time,
    observe,
  });
  result.activate();
  return result;
}
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  time = 1000;
  observe.mockImplementation(async (value) => ({
    status: 'pending',
    operationId: value.operationId,
    code: 'account_creation_outcome_unknown',
    nextAction: 'inspect',
  }));
});
it('persists only validated scoped identity before dispatch and recovers the same UUID after remount', async () => {
  const original = session();
  const reference = original.prepare(payload);
  expect(sessionStorage.getItem(original.key)).not.toContain(
    payload.temporaryPassword
  );
  expect(sessionStorage.getItem(original.key)).not.toContain(
    'temporaryPassword'
  );
  original.retire();
  const remount = session();
  expect(remount.load()).toEqual(reference);
  await remount.read();
  expect(observe.mock.calls[0]?.[0].operationId).toBe(reference.operationId);
  expect(() => remount.prepare(payload)).toThrow('Unresolved');
  expect(session('10000000-0000-4000-8000-000000000002').load()).toBeNull();
  expect(
    session(actorId, '10000000-0000-4000-8000-000000000003').load()
  ).toBeNull();
});
it('bounds total read attempts across remounts and never resets an exhausted deadline', async () => {
  let current = session();
  current.prepare(payload);
  for (let count = 0; count < 6; count++) {
    await current.read();
    current.retire();
    current = session();
    current.load();
  }
  await current.read();
  expect(observe).toHaveBeenCalledTimes(6);
  expect(current.canRead()).toBe(false);
});
it('stops when elapsed budget expires and preserves the unresolved reference', async () => {
  const current = session();
  current.prepare(payload);
  await current.read();
  time += 30_000;
  await current.read();
  expect(observe).toHaveBeenCalledTimes(1);
  expect(current.load()).not.toBeNull();
});
it('rejects corrupted storage before creating a replacement operation', () => {
  const current = session();
  sessionStorage.setItem(current.key, '{bad');
  expect(() => current.prepare(payload)).toThrow();
  expect(observe).not.toHaveBeenCalled();
});
it('stops permission denial without replay and retains the reference', async () => {
  const current = session();
  current.prepare(payload);
  observe.mockRejectedValue(new InternalApiError('denied', 403));
  await current.read();
  await current.read();
  expect(current.reference?.state).toBe('stopped');
  expect(observe).toHaveBeenCalledTimes(1);
});
it('ignores a late result after retirement', async () => {
  let resolve: (value: unknown) => void = () => {};
  observe.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const current = session();
  const original = current.prepare(payload);
  const pending = current.read();
  current.retire();
  resolve({
    status: 'created',
    operationId: original.operationId,
    account: {
      id: actorId,
      email: payload.email,
      displayName: payload.displayName,
    },
  });
  await expect(pending).rejects.toThrow('retired');
  expect(sessionStorage.getItem(current.key)).not.toBeNull();
});
it('clears the reference only on confirmed completion', async () => {
  const current = session();
  const original = current.prepare(payload);
  observe.mockResolvedValue({
    status: 'created',
    operationId: original.operationId,
    account: {
      id: actorId,
      email: payload.email,
      displayName: payload.displayName,
    },
  });
  expect((await current.read())?.status).toBe('created');
  expect(current.load()).toBeNull();
});
it('preserves terminal conflicts across remount without an observation', async () => {
  const original = session();
  original.prepare(payload);
  original.stop('conflict');
  original.retire();
  const remount = session();
  expect(remount.load()?.state).toBe('conflict');
  await remount.read();
  expect(observe).not.toHaveBeenCalled();
});
it('starts the recovery budget after a slow original request rather than expiring before uncertainty', async () => {
  const original = session();
  original.prepare(payload);
  time += 60_000;
  await original.read();
  expect(observe).toHaveBeenCalledTimes(1);
  expect(original.reference?.startedAt).toBe(time);
});
it('stops safely when persisting the read budget fails', async () => {
  const original = session();
  original.prepare(payload);
  const write = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('quota');
    });
  await original.read();
  expect(observe).not.toHaveBeenCalled();
  expect(original.canRead()).toBe(false);
  write.mockRestore();
});
it('stops denial even when persisting the terminal state fails', async () => {
  const current = session();
  current.prepare(payload);
  observe.mockImplementation(async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    throw new InternalApiError('denied', 403);
  });
  try {
    await expect(current.read()).resolves.toBeNull();
    expect(current.canRead()).toBe(false);
  } finally {
    vi.restoreAllMocks();
  }
});

it('retains the operation across adjudication loss, readback and one explicit same-operation submission', async () => {
  const inspectRejection = vi.fn();
  const adjudicateRejection = vi.fn();
  const make = () => {
    const value = new EmployeeCreationRecovery({
      actorId,
      workspaceId,
      storage: sessionStorage,
      assertActive: active,
      inspectRejection,
      adjudicateRejection,
    });
    value.activate();
    return value;
  };
  const current = make();
  const original = current.prepare(payload);
  current.stop('stopped');
  const eligible = {
    status: 'eligible',
    actorUserId: actorId,
    operationId: original.operationId,
    targetUserId: '10000000-0000-4000-8000-000000000003',
    email: payload.email,
    displayName: payload.displayName,
    originalLeaseId: '10000000-0000-4000-8000-000000000004',
    originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
    expectedVersion: 2,
  } satisfies Extract<EmployeeRejectionRecoveryState, { status: 'eligible' }>;
  inspectRejection.mockResolvedValue(eligible);
  adjudicateRejection.mockRejectedValue(new Error('lost'));
  await expect(
    current.adjudicateRejection(eligible, 'a'.repeat(64))
  ).rejects.toThrow('lost');
  expect(current.reference?.state).toBe('adjudicating');
  expect(() => current.prepare(payload)).toThrow('Unresolved');
  const submitted = adjudicateRejection.mock.calls[0]?.[0].adjudication;
  current.retire();
  const remount = make();
  remount.load();
  inspectRejection.mockResolvedValue({
    ...eligible,
    status: 'retry_ready',
    expectedVersion: 3,
    eventId: submitted.eventId,
    evidenceReferenceSha256: submitted.evidenceReferenceSha256,
  });
  await remount.inspectRejection();
  expect(remount.reference?.state).toBe('retry_ready');
  expect(() =>
    remount.prepare({ ...payload, email: 'other@tuturuuu.com' })
  ).toThrow('Unresolved');
  expect(remount.prepare(payload).operationId).toBe(original.operationId);
  expect(() => remount.prepare(payload)).toThrow('Unresolved');
  expect(sessionStorage.getItem(remount.key)).not.toContain(
    payload.temporaryPassword
  );
  expect(adjudicateRejection).toHaveBeenCalledTimes(1);
});

it('rejects foreign recovery readback and cannot adjudicate after actor retirement', async () => {
  const inspectRejection = vi.fn();
  const adjudicateRejection = vi.fn();
  const recovery = new EmployeeCreationRecovery({
    actorId,
    workspaceId,
    storage: sessionStorage,
    assertActive: active,
    inspectRejection,
    adjudicateRejection,
  });
  recovery.activate();
  const original = recovery.prepare(payload);
  inspectRejection.mockResolvedValue({
    status: 'fenced',
    operationId: '10000000-0000-4000-8000-000000000009',
  });
  await expect(recovery.inspectRejection()).rejects.toThrow('scope');
  expect(recovery.reference?.operationId).toBe(original.operationId);
  recovery.retire();
  await expect(recovery.inspectRejection()).rejects.toThrow('retired');
  expect(adjudicateRejection).not.toHaveBeenCalled();
});

it('retries only an explicit fresh eligible adjudication with the original event, digest and tuple', async () => {
  const inspectRejection = vi.fn();
  const adjudicateRejection = vi.fn();
  const current = new EmployeeCreationRecovery({
    actorId,
    workspaceId,
    storage: sessionStorage,
    assertActive: active,
    inspectRejection,
    adjudicateRejection,
  });
  current.activate();
  const original = current.prepare(payload);
  const eligible = {
    status: 'eligible',
    actorUserId: actorId,
    operationId: original.operationId,
    targetUserId: '10000000-0000-4000-8000-000000000003',
    email: payload.email,
    displayName: payload.displayName,
    originalLeaseId: '10000000-0000-4000-8000-000000000004',
    originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
    expectedVersion: 2,
  } satisfies Extract<EmployeeRejectionRecoveryState, { status: 'eligible' }>;
  inspectRejection.mockResolvedValue(eligible);
  adjudicateRejection.mockRejectedValue(new Error('precommit unavailable'));
  await expect(
    current.adjudicateRejection(eligible, 'a'.repeat(64))
  ).rejects.toThrow('precommit');
  const first = adjudicateRejection.mock.calls[0]?.[0];
  await expect(
    current.adjudicateRejection(eligible, 'b'.repeat(64))
  ).rejects.toThrow('evidence');
  await expect(
    current.adjudicateRejection(
      { ...eligible, targetUserId: actorId },
      'a'.repeat(64)
    )
  ).rejects.toThrow('tuple');
  await expect(
    current.adjudicateRejection(
      { ...eligible, actorUserId: eligible.targetUserId },
      'a'.repeat(64)
    )
  ).rejects.toThrow('scope');
  inspectRejection.mockResolvedValue({
    status: 'fenced',
    operationId: original.operationId,
  });
  await expect(
    current.adjudicateRejection(eligible, 'a'.repeat(64))
  ).rejects.toThrow('Fresh eligible');
  expect(adjudicateRejection).toHaveBeenCalledTimes(1);
  inspectRejection.mockResolvedValue(eligible);
  await expect(
    current.adjudicateRejection(eligible, 'a'.repeat(64))
  ).rejects.toThrow('precommit');
  expect(adjudicateRejection.mock.calls[1]?.[0]).toEqual(first);
  inspectRejection.mockResolvedValue({
    ...eligible,
    status: 'retry_ready',
    expectedVersion: 3,
    eventId: first.adjudication.eventId,
    evidenceReferenceSha256: first.adjudication.evidenceReferenceSha256,
  });
  await expect(
    current.adjudicateRejection(eligible, 'a'.repeat(64))
  ).resolves.toMatchObject({ status: 'retry_ready' });
  expect(adjudicateRejection).toHaveBeenCalledTimes(2);
  expect(current.prepare(payload).operationId).toBe(original.operationId);
  expect(() => current.prepare(payload)).toThrow('Unresolved');
});

it('denies overlapping dispatch and actor retirement during fresh inspection', async () => {
  let resolveInspection: (value: EmployeeRejectionRecoveryState) => void =
    () => {};
  const inspectRejection = vi.fn(
    () =>
      new Promise<EmployeeRejectionRecoveryState>((resolve) => {
        resolveInspection = resolve;
      })
  );
  const adjudicateRejection = vi.fn();
  const current = new EmployeeCreationRecovery({
    actorId,
    workspaceId,
    storage: sessionStorage,
    assertActive: active,
    inspectRejection,
    adjudicateRejection,
  });
  current.activate();
  const original = current.prepare(payload);
  const eligible = {
    status: 'eligible',
    actorUserId: actorId,
    operationId: original.operationId,
    targetUserId: '10000000-0000-4000-8000-000000000003',
    email: payload.email,
    displayName: payload.displayName,
    originalLeaseId: '10000000-0000-4000-8000-000000000004',
    originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
    expectedVersion: 2,
  } satisfies Extract<EmployeeRejectionRecoveryState, { status: 'eligible' }>;
  const first = current.adjudicateRejection(eligible, 'a'.repeat(64));
  await expect(
    current.adjudicateRejection(eligible, 'a'.repeat(64))
  ).rejects.toThrow('in flight');
  current.retire();
  resolveInspection(eligible);
  await expect(first).rejects.toThrow('retired');
  expect(adjudicateRejection).not.toHaveBeenCalled();
});

it('completes renamed observation only when its immutable creation name matches the retained reference', async () => {
  const current = session();
  const original = current.prepare(payload);
  const outcome = {
    status: 'created',
    operationId: original.operationId,
    account: {
      id: actorId,
      email: payload.email,
      displayName: 'Duyên Dương',
      creationDisplayName: payload.displayName,
    },
  };
  observe.mockResolvedValue(outcome);
  expect(await current.read()).toEqual(outcome);
  expect(current.load()).toBeNull();
  expect(observe).toHaveBeenCalledTimes(1);
});

it.each([
  { displayName: 'Duyên Dương' },
  { displayName: 'Duyên Dương', creationDisplayName: 'Foreign original' },
  { displayName: payload.displayName, creationDisplayName: 'Foreign original' },
  {
    displayName: 'Duyên Dương',
    creationDisplayName: payload.displayName,
    email: 'foreign@tuturuuu.com',
  },
])(
  'retains pending original recovery when observed renamed identity does not match',
  async (patch) => {
    const current = session();
    const original = current.prepare(payload);
    observe.mockResolvedValue({
      status: 'created',
      operationId: original.operationId,
      account: { id: actorId, email: payload.email, ...patch },
    });
    expect(await current.read()).toBeNull();
    expect(current.load()).toMatchObject({
      operationId: original.operationId,
      email: payload.email,
      displayName: payload.displayName,
      state: 'pending',
    });
    expect(observe).toHaveBeenCalledTimes(1);
  }
);
