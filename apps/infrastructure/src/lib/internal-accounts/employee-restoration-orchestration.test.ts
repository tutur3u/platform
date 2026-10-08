import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeManagementError, providerState } from './employee-restoration-boundary';
import { restoreEmployeeAccess } from './employee-restoration-orchestration';
import {
  ack, actor, definiteCodes, denial, email, id, makeFixture, malformedAcks,
  op, operationReceipt, otherOp, providerError, readReply, restoredReceipt,
  updateReply, type User,
} from './employee-restoration-test-fixture';

vi.mock('server-only', () => ({}));
vi.mock('node:crypto', () => ({ randomUUID: vi.fn() }));
let f: ReturnType<typeof makeFixture>;
beforeEach(() => {
  vi.mocked(randomUUID).mockReset().mockReturnValue(op);
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08'));
  f = makeFixture();
});
afterEach(() => vi.restoreAllMocks());
const pending = (uncertain = true) => ({
  status: 'pending', operationId: op, nextAction: 'inspect',
  code: uncertain ? 'employee_restore_outcome_unknown' : 'employee_restore_confirmation_pending',
  message: 'Employee restoration is pending. Inspect this operation before taking another action.',
});
function noReservation() {
  expect(f.operations.begin).not.toHaveBeenCalled();
  expect(f.operations.markAttempt).not.toHaveBeenCalled();
  expect(f.updateUserById).not.toHaveBeenCalled();
  expect(randomUUID).not.toHaveBeenCalled();
}

describe('unwired restoration, prospective runtime regressions', () => {
  it('acknowledges both durable steps before one bound unban, independent read and exact proof', async () => {
    expect(await restoreEmployeeAccess(f.input)).toEqual({
      status: 'restored', account: { id, email, displayName: 'Fixture' }, operationId: op, revision: 1,
    });
    expect(f.events).toEqual(['actor', 'read', 'inspect', 'begin', 'markAttempt', 'update', 'read', 'confirm']);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(f.getUserById.mock.calls).toEqual([[actor], [id], [id]]);
    expect(f.operations.inspect).toHaveBeenCalledExactlyOnceWith({ actorUserId: actor, targetUserId: id, email });
    const tuple = { actorUserId: actor, targetUserId: id, email, expectedRevision: 0, operationId: op };
    for (const callback of [f.operations.begin, f.operations.markAttempt, f.operations.confirm])
      expect(callback).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(f.updateUserById).toHaveBeenCalledExactlyOnceWith(id, { ban_duration: 'none' });
    expect(f.operations.reconcile).not.toHaveBeenCalled();
    expect(Object.keys(f.provider).sort()).toEqual(['getUserById', 'updateUserById']);
  });
  it('keeps a nonzero original revision through every callback and increments only the receipt', async () => {
    f.inspection.revision = 7;
    const result = await restoreEmployeeAccess({ ...f.input, expectedRevision: 7 });
    expect(result).toMatchObject({ status: 'restored', revision: 8 });
    for (const callback of [f.operations.begin, f.operations.markAttempt, f.operations.confirm])
      expect(callback.mock.calls[0]?.[0]).toEqual({ actorUserId: actor, targetUserId: id, email, expectedRevision: 7, operationId: op });
    expect(f.inspection.revision).toBe(7);
  });
  it('contains malformed payload getters at each stage without permitting the next effect', async () => {
    for (const stage of ['inspect', 'begin', 'markAttempt', 'confirm'] as const) {
      f = makeFixture();
      f.operations[stage].mockImplementation(async () => {
        const data = stage === 'inspect' ? { ...f.inspection }
          : stage === 'confirm' ? restoredReceipt({ actorUserId: actor, targetUserId: id, email, expectedRevision: 0, operationId: op })
          : { operationId: op, revision: 0, phase: stage === 'begin' ? 'reserved' : 'attempted' };
        return ack(Object.defineProperty(data, 'revision', { get() { throw Error('private payload diagnostic'); } }));
      });
      if (stage === 'inspect') await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 503 });
      else expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
      expect(f.updateUserById).toHaveBeenCalledTimes(stage === 'confirm' ? 1 : 0);
    }
  });
  it('strips semantic diagnostic fields from successful envelopes before strict payload validation', async () => {
    f.operations.inspect.mockResolvedValue({ ...ack(f.inspection), details: 'private diagnostic' });
    f.operations.begin.mockImplementation(async args => ({ ...operationReceipt(args, 'reserved'), hint: 'private diagnostic' }));
    f.operations.markAttempt.mockImplementation(async args => ({ ...operationReceipt(args, 'attempted'), message: 'private diagnostic' }));
    f.operations.confirm.mockImplementation(async args => ({ ...ack(restoredReceipt(args)), details: 'private diagnostic' }));
    expect(await restoreEmployeeAccess(f.input)).toEqual({ status: 'restored', account: { id, email, displayName: 'Fixture' }, operationId: op, revision: 1 });
    expect(f.updateUserById).toHaveBeenCalledExactlyOnceWith(id, { ban_duration: 'none' });
  });
  it.each([undefined, '2020-01-01', '2026-10-08'])(
    'already active ban %s still reserves and freshly proves without mark or update', async (banned_until) => {
      f.user.banned_until = banned_until;
      expect(await restoreEmployeeAccess(f.input)).toMatchObject({ status: 'restored' });
      expect(f.events).toEqual(['actor', 'read', 'inspect', 'begin', 'read', 'confirm']);
      expect(f.operations.markAttempt).not.toHaveBeenCalled();
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(f.operations.confirm).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['pending', 'provisioned', 'absent'] as const)('rejects %s registry before reservation', async (registryState) => {
    f.inspection.registryState = registryState;
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 409 });
    noReservation();
  });
  it.each([
    { managed: false }, { readinessCode: 'tuple_conflict', reservation: 'conflicting_tuple' },
    { mailboxReady: false }, { readinessCode: 'mailbox_unavailable' },
    { readinessCode: 'creation_pending' }, { readinessCode: 'not_managed' },
    { reservation: 'conflicting_tuple' }, { revision: 2 }, { revision: null },
    ...['reserved', 'attempted', 'unknown'].map(phase => ({ operation: { operationId: otherOp, revision: 0, phase } })),
  ])('refuses readiness/revision/unresolved-operation %j', async (patch) => {
    Object.assign(f.inspection, patch);
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 409 });
    noReservation();
  });
  it('allows a completed historical inspection operation without adopting its id', async () => {
    f.inspection.operation = { operationId: otherOp, revision: 0, phase: 'completed' };
    expect(await restoreEmployeeAccess(f.input)).toMatchObject({ operationId: op, revision: 1 });
    expect(f.operations.begin.mock.calls[0]?.[0].operationId).toBe(op);
  });
  it.each([
    [{ email: 'foreign@tuturuuu.com' }, 503], [{ email_confirmed_at: undefined }, 409],
    [{ banned_until: 'malformed' }, 409], [{ app_metadata: {} }, 409],
    [{ app_metadata: { employee_onboarding: 'true' } }, 409],
    [{ app_metadata: { employee_onboarding: false } }, 409], [{ id: otherOp }, 409],
  ] as const)('fails closed for initial target drift %j', async (patch, status) => {
    Object.assign(f.user, patch);
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status });
    noReservation();
  });
  it.each([
    { targetUserId: 'invalid' }, { confirmationEmail: 'outside@example.test' },
    { expectedRevision: -1 },
    { expectedRevision: 0.5 }, { expectedRevision: Number.MAX_SAFE_INTEGER },
    { expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { expectedRevision: Number.NaN },
  ])('validates input before all reads %j', async (patch) => {
    await expect(restoreEmployeeAccess({ ...f.input, ...patch })).rejects.toMatchObject({ status: 400 });
    expect(f.getUserById).not.toHaveBeenCalled(); noReservation();
  });
  it('rejects confirmation and self before effects', async () => {
    await expect(restoreEmployeeAccess({ ...f.input, confirmationEmail: 'wrong@tuturuuu.com' }))
      .rejects.toMatchObject({ status: 400 });
    noReservation();
    f = makeFixture();
    await expect(restoreEmployeeAccess({ ...f.input, actorUserId: id })).rejects.toMatchObject({ status: 409 });
    expect(f.getUserById).not.toHaveBeenCalled(); noReservation();
  });
  it.each([
    { id: otherOp }, { email: 'external@example.test' }, { email: undefined },
    { email_confirmed_at: undefined }, { banned_until: '2126-01-01' }, { banned_until: 'unknown' },
  ] satisfies Partial<User>[])('fresh actor refusal stops target and semantics %j', async (patch) => {
    Object.assign(f.administrator, patch);
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 403 });
    expect(f.getUserById.mock.calls).toEqual([[actor]]);
    expect(f.operations.inspect).not.toHaveBeenCalled(); noReservation();
  });
  it.each(['error', 'throw', 'missing'] as const)('actor %s is denied before target', async (mode) => {
    if (mode === 'throw') f.getUserById.mockRejectedValue(Error('private actor transport'));
    else f.getUserById.mockResolvedValue(providerError(mode === 'missing' ? 404 : 503));
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 503 });
    expect(f.getUserById.mock.calls).toEqual([[actor]]);
    expect(f.operations.inspect).not.toHaveBeenCalled(); noReservation();
  });
  it.each(['throw', 'error'] as const)('target %s fails closed before inspection', async (mode) => {
    const original = f.getUserById.getMockImplementation()!;
    f.getUserById.mockImplementation(async function (target) {
      if (target === actor) return original.call(f.provider, target);
      if (mode === 'throw') throw Error('private target transport');
      return providerError();
    });
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 503 });
    expect(f.operations.inspect).not.toHaveBeenCalled(); noReservation();
  });
  it.each([[404, 'unexpected_failure'], [503, 'user_not_found']] as const)(
    'genuine absent provider %s/%s and no registry/intent is pre-effect 404', async (status, code) => {
      const original = f.getUserById.getMockImplementation()!;
      f.getUserById.mockImplementation(async function (target) {
        return target === actor ? original.call(f.provider, target) : providerError(status, code);
      });
      Object.assign(f.inspection, { email: null, registryState: 'absent', reservation: 'none', managed: false,
        revision: null, mailboxReady: false, readinessCode: 'not_managed' });
      await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 404 });
      expect(f.operations.inspect).toHaveBeenCalledExactlyOnceWith({ actorUserId: actor, targetUserId: id, email: null });
      noReservation();
    }
  );
  it.each([
    { id: actor }, { email: 'wrong@tuturuuu.com' }, { revision: -1 }, { managed: 'yes' },
    { recovery: { email: null, verified: false, extra: true } }, { extra: true },
    { operation: { operationId: op, revision: 0, phase: 'reserved', extra: true } },
  ])('rejects strict malformed/mismatched inspection %j', async (patch) => {
    f.operations.inspect.mockResolvedValue(ack({ ...f.inspection, ...patch }));
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 503 }); noReservation();
  });
  it.each(malformedAcks)('rejects malformed inspection envelope %j before reserve', async (value) => {
    f.operations.inspect.mockResolvedValue(value);
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 503 }); noReservation();
  });
  it.each(['PGRST202', 'UNKNOWN'])('missing/unknown semantic inspection %s fails closed', async (code) => {
    f.operations.inspect.mockResolvedValue(denial(code));
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status: 503 }); noReservation();
  });
  it.each(definiteCodes)('root/tuple inspection denial %s preserves %s before reserve', async (code, status) => {
    f.operations.inspect.mockResolvedValue(denial(code));
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status });
    expect(f.operations.inspect).toHaveBeenCalledTimes(1); noReservation();
  });
  for (const stage of ['begin', 'markAttempt'] as const) {
    it.each(malformedAcks)(`malformed ${stage} envelope %j never authorizes update`, async (value) => {
      f.operations[stage].mockResolvedValue(value);
      expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(f.operations.confirm).not.toHaveBeenCalled();
      if (stage === 'begin') expect(f.operations.markAttempt).not.toHaveBeenCalled();
    });
    it.each(['throw', 'wrong_id', 'wrong_revision', 'wrong_phase', 'extra', 'malformed'] as const)(
      `lost/mismatched ${stage} %s prevents launch`, async (mode) => {
        f.operations[stage].mockImplementation(async args => {
          if (mode === 'throw') throw Error('private transport');
          return ack(mode === 'malformed' ? {} : {
            operationId: mode === 'wrong_id' ? otherOp : args.operationId,
            revision: mode === 'wrong_revision' ? 2 : args.expectedRevision,
            phase: mode === 'wrong_phase' ? 'completed' : stage === 'begin' ? 'reserved' : 'attempted',
            ...(mode === 'extra' ? { extra: true } : {}),
          });
        });
        expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
        expect(f.updateUserById).not.toHaveBeenCalled();
        expect(f.operations.confirm).not.toHaveBeenCalled();
      }
    );
    it.each(definiteCodes)(`${stage} denial %s retains its distinct catch`, async (code, status) => {
      f.operations[stage].mockResolvedValue(denial(code));
      if (stage === 'begin') await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ status });
      else expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(f.operations.confirm).not.toHaveBeenCalled();
    });
  }
  it.each(['throw', 'error'] as const)('ambiguous provider %s contains exactly one write', async mode => {
    if (mode === 'throw') f.updateUserById.mockRejectedValue(Error('private possibly-applied update'));
    else f.updateUserById.mockResolvedValue(providerError());
    expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.getUserById).toHaveBeenCalledTimes(2);
    expect(f.operations.confirm).not.toHaveBeenCalled();
  });
  it.each([
    { id: otherOp }, { email: 'foreign@tuturuuu.com' }, { email_confirmed_at: undefined },
    { banned_until: '2126-01-01' }, { banned_until: 'invalid' }, { app_metadata: {} },
    { app_metadata: { employee_onboarding: 'true' } },
  ] satisfies Partial<User>[])('contains provider update mismatch %j', async patch => {
    f.updateUserById.mockResolvedValue(updateReply({ ...f.active, ...patch }));
    expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.operations.confirm).not.toHaveBeenCalled();
    expect(f.getUserById).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ banned_until: '2126-01-01' }, false], [{ id: otherOp }, true],
    [{ email: 'drift@tuturuuu.com' }, false], [{ banned_until: 'unknown' }, false],
    [{ email_confirmed_at: undefined }, false], [{ app_metadata: {} }, false],
  ] as const)('requires independent fresh proof %j, uncertain=%s', async (patch, uncertain) => {
    Object.assign(f.active, patch);
    // Update succeeds with a separate value; the later read has drifted.
    f.updateUserById.mockResolvedValue(updateReply({ ...f.user, banned_until: undefined }));
    expect(await restoreEmployeeAccess(f.input)).toEqual(pending(uncertain));
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.getUserById.mock.calls).toEqual([[actor], [id], [id]]);
    expect(f.operations.confirm).not.toHaveBeenCalled();
  });
  it.each(['throw', 'error', 'missing'] as const)('fresh read %s stops confirmation', async mode => {
    const original = f.getUserById.getMockImplementation()!;
    f.getUserById.mockImplementation(async function (target) {
      if (target === id && f.updateUserById.mock.calls.length) {
        if (mode === 'throw') throw Error('private fresh read');
        return providerError(mode === 'missing' ? 404 : 503, mode === 'missing' ? 'user_not_found' : 'unexpected_failure');
      }
      return original.call(f.provider, target);
    });
    expect(await restoreEmployeeAccess(f.input)).toEqual(pending(mode !== 'missing'));
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.operations.confirm).not.toHaveBeenCalled();
  });
  it.each([
    { id: otherOp }, { email: 'wrong@tuturuuu.com' }, { displayName: 'Foreign fixture' },
    { displayName: '' }, { operationId: otherOp }, { revision: 3 }, { status: 'pending' }, { extra: true },
  ])('strict confirmation mismatch %j stays pending after one write', async patch => {
    f.operations.confirm.mockImplementation(async args => ack({ ...restoredReceipt(args), ...patch }));
    expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
  });
  it.each([...malformedAcks, ...definiteCodes.map(([code]) => denial(code)), denial('PGRST202')])(
    'confirmation envelope/error %j stays pending without retry', async value => {
      f.operations.confirm.mockResolvedValue(value);
      expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
      expect(f.updateUserById).toHaveBeenCalledTimes(1);
      expect(f.operations.confirm).toHaveBeenCalledTimes(1);
    }
  );
  it('lost confirmation cannot retry or compensate', async () => {
    f.operations.confirm.mockRejectedValue(Error('private SQL response'));
    expect(await restoreEmployeeAccess(f.input)).toEqual(pending());
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.operations.begin).toHaveBeenCalledTimes(1);
  });
  it('projects only safe restored/pending values and never logs private diagnostics', async () => {
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const restored = await restoreEmployeeAccess(f.input);
    f = makeFixture(); f.operations.confirm.mockResolvedValue(denial('23514'));
    const uncertain = await restoreEmployeeAccess(f.input);
    expect(restored).toEqual({ status: 'restored', account: { id, email, displayName: 'Fixture' }, operationId: op, revision: 1 });
    expect(uncertain).toEqual(pending());
    for (const output of [restored, uncertain]) {
      expect(JSON.stringify(output)).not.toMatch(/private-recovery|private diagnostic|password|recovery|details/);
    }
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
  it('synthetic competing begin admits one helper only, without claiming SQL concurrency', async () => {
    let reserved = false;
    f.getUserById.mockImplementation(async function (this: typeof f.provider, target) {
      expect(this).toBe(f.provider);
      return readReply(target === actor ? f.administrator : f.updateUserById.mock.calls.length ? f.active : f.user);
    });
    vi.mocked(randomUUID).mockReturnValueOnce(op).mockReturnValueOnce(otherOp);
    f.operations.begin.mockImplementation(async args => {
      if (reserved) return denial('23505');
      reserved = true; return operationReceipt(args, 'reserved');
    });
    const results = await Promise.allSettled([restoreEmployeeAccess(f.input), restoreEmployeeAccess(f.input)]);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.operations.confirm).toHaveBeenCalledTimes(1);
  });
  it('throws its own error identity with a fixed safe message', async () => {
    f.operations.inspect.mockResolvedValue(denial('42501'));
    await expect(restoreEmployeeAccess(f.input)).rejects.toBeInstanceOf(EmployeeManagementError);
    await expect(restoreEmployeeAccess(f.input)).rejects.toMatchObject({ message: 'Employee management could not be verified', code: 'employee_management_forbidden', status: 403 });
  });
  it.each(['malformed', 'not a timestamp'])('nonempty malformed ban %s is unknown', value => {
    expect(providerState({ ...f.active, banned_until: value })).toBe('unknown');
  });
});
