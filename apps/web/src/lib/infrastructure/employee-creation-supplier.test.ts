import { AuthApiError } from '@tuturuuu/supabase/auth-errors';
import { describe, expect, it, vi } from 'vitest';
import type { EmployeeReadiness } from './employee-creation-readiness';
import {
  type EmployeeAuthAdmin,
  type EmployeeFixedExecutor,
  makeEmployeeCreationSupplier,
} from './employee-creation-supplier';

vi.mock('server-only', () => ({}));
const password = 'synthetic-password';
const now = Date.parse('2026-10-13T00:00:00Z');
const operation = {
  operationId: '00000000-0000-4000-8000-000000000001',
  actorUserId: '00000000-0000-4000-8000-000000000002',
  targetUserId: '00000000-0000-4000-8000-000000000003',
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
};
const scopeBase = {
  appSession: 'infrastructure',
  administrator: true,
  actionAuthorized: true,
  actionHeader: '1',
  origin: 'https://infrastructure.invalid',
  requestOrigin: 'https://infrastructure.invalid',
  site: 'same-origin',
};
const receipt = {
  id: operation.targetUserId,
  email: operation.email,
  displayName: operation.displayName,
  status: 'pending',
};
type Reply = Awaited<ReturnType<EmployeeAuthAdmin['createUser']>>;
type User = NonNullable<Reply['data']['user']>;
const banned: User = {
  id: operation.targetUserId,
  email: operation.email,
  email_confirmed_at: '2026-10-12T00:00:00Z',
  banned_until: '2126-01-01T00:00:00Z',
  app_metadata: { employee_onboarding: true },
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-10-12T00:00:00Z',
};
const active: User = { ...banned, banned_until: undefined };
const reply = (user: User): Reply => ({ data: { user }, error: null });
function fixture() {
  let member = true;
  let clock = now;
  let user = banned;
  const configuration = {
    database: {
      host: 'invalid',
      port: 5432,
      database: 'postgres',
      user: 'test',
      password: 'synthetic',
    },
    requirements: {},
    signedProjectBinding: {},
    executionQualification: {},
    trustedOperatorPublicKey: 'fixture',
  };
  const readiness = vi.fn(
    async (): Promise<EmployeeReadiness> => ({
      kind: 'qualified',
      configuration,
      observedAt: now - 100,
      expiresAt: now + 1000,
    })
  );
  const scope = vi.fn<() => Promise<unknown>>(async () => ({
    ...scopeBase,
    operation,
    administrator: member,
  }));
  const execute = vi.fn<EmployeeFixedExecutor>(async ({ phase }) => ({
    kind: 'committed',
    result:
      phase === 'preflight'
        ? true
        : { ...receipt, status: phase === 'confirm' ? 'created' : 'pending' },
  }));
  const create = vi.fn<EmployeeAuthAdmin['createUser']>(async () =>
    reply(banned)
  );
  const read = vi.fn<EmployeeAuthAdmin['getUserById']>(async () => reply(user));
  const update = vi.fn<EmployeeAuthAdmin['updateUserById']>(async () => {
    user = active;
    return reply(active);
  });
  let consumed = false;
  const consume = vi.fn(async () => {
    if (consumed) return false;
    consumed = true;
    return true;
  });
  const deps = {
    executeFixedEmployeeSql: execute,
    auth: { createUser: create, getUserById: read, updateUserById: update },
    readiness,
    scope,
    consumeCreatePermission: consume,
    now: () => clock,
  };
  return {
    supplier: makeEmployeeCreationSupplier(deps),
    deps,
    execute,
    create,
    read,
    update,
    consume,
    scope,
    readiness,
    revoke: () => {
      member = false;
    },
    expire: () => {
      clock = now + 1000;
    },
    setUser: (v: User) => {
      user = v;
    },
  };
}
describe('journal phase supplier', () => {
  it('denies effects when readiness cannot be read', async () => {
    const f = fixture();
    f.readiness.mockRejectedValue(new Error('unavailable'));
    expect(await f.supplier.createOnce(operation, password)).toEqual({
      kind: 'denied',
    });
    expect(f.consume).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  it('retains unknown when provider inspection loses its response', async () => {
    const f = fixture();
    f.read.mockRejectedValue(new Error('connection lost'));
    expect(await f.supplier.inspect(operation)).toEqual({
      kind: 'provider_unknown',
    });
    expect(await f.supplier.finalize(operation)).toEqual({ kind: 'denied' });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('does not publish SQL confirmation after an ambiguous activation', async () => {
    const f = fixture();
    f.update.mockRejectedValue(new Error('activation response lost'));
    expect(
      await f.supplier.activate(operation, { operation, receipt })
    ).toEqual({ kind: 'provider_unknown' });
    expect(f.update).toHaveBeenCalledTimes(1);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
  });
  it('does not activate a provider identity with an invalid ban timestamp', async () => {
    const f = fixture();
    f.setUser({ ...banned, banned_until: 'invalid' });
    expect(
      await f.supplier.activate(operation, { operation, receipt })
    ).toEqual({ kind: 'provider_unknown' });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('maps exact provider conflicts; other provider errors remain unknown', async () => {
    for (const code of [
      'email_exists',
      'user_already_exists',
      'unexpected_failure',
    ]) {
      const f = fixture();
      f.create.mockResolvedValue({
        data: { user: null },
        error: new AuthApiError('synthetic', 400, code),
      });
      expect(await f.supplier.createOnce(operation, password)).toEqual({
        kind:
          code === 'unexpected_failure'
            ? 'provider_unknown'
            : 'provider_conflict',
      });
      expect(await f.supplier.createOnce(operation, password)).toEqual({
        kind: 'inspect_required',
      });
      expect(f.create).toHaveBeenCalledTimes(1);
    }
  });
  it('rejects a finalization receipt bound to another original operation', async () => {
    const f = fixture();
    expect(
      await f.supplier.activate(operation, {
        operation: { ...operation, operationId: operation.actorUserId },
        receipt,
      })
    ).toEqual({ kind: 'denied' });
    expect(f.read).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('calls the exact fixed phases and identity, then confirms only after Auth activation and read', async () => {
    const f = fixture();
    expect(await f.supplier.preflight(operation)).toEqual({
      kind: 'committed',
      result: true,
      continuationAllowed: true,
    });
    expect(await f.supplier.createOnce(operation, password)).toEqual({
      kind: 'verified',
      state: 'banned',
      continuationAllowed: true,
    });
    expect(f.consume).toHaveBeenCalledWith(operation);
    expect(f.create).toHaveBeenCalledWith({
      id: operation.targetUserId,
      email: operation.email,
      password: password,
      email_confirm: true,
      ban_duration: '876000h',
      app_metadata: { employee_onboarding: true },
      user_metadata: { display_name: 'Staff', full_name: 'Staff' },
    });
    expect(await f.supplier.finalize(operation)).toEqual({
      kind: 'committed',
      result: receipt,
      continuationAllowed: true,
    });
    expect(
      await f.supplier.activate(operation, { operation, receipt })
    ).toEqual({
      kind: 'committed',
      result: { ...receipt, status: 'created' },
      continuationAllowed: true,
    });
    expect(f.execute.mock.calls.map(([v]) => v.phase)).toEqual([
      'preflight',
      'finalize',
      'confirm',
    ]);
    expect(f.execute.mock.calls[0]?.[0].identity).toEqual({
      actorUserId: operation.actorUserId,
      userId: operation.targetUserId,
      email: operation.email,
      displayName: operation.displayName,
    });
    expect(f.update).toHaveBeenCalledWith(operation.targetUserId, {
      ban_duration: 'none',
    });
    expect(f.read.mock.invocationCallOrder.at(-1)).toBeLessThan(
      f.execute.mock.invocationCallOrder.at(-1) ?? 0
    );
  });
  it('preserves all real worker outcomes instead of inventing query replies', async () => {
    for (const kind of ['denied', 'aborted', 'commit_unknown'] as const) {
      const f = fixture();
      f.execute.mockResolvedValue({ kind });
      expect(await f.supplier.preflight(operation)).toEqual({ kind });
      expect(f.create).not.toHaveBeenCalled();
    }
    const f = fixture();
    f.execute.mockRejectedValue(new Error('lost COMMIT'));
    expect(await f.supplier.preflight(operation)).toEqual({
      kind: 'commit_unknown',
    });
  });
  it('retains known committed receipt when membership changes during SQL; denies continuation', async () => {
    const f = fixture();
    f.execute.mockImplementation(async () => {
      f.revoke();
      return { kind: 'committed', result: true };
    });
    expect(await f.supplier.preflight(operation)).toEqual({
      kind: 'committed',
      result: true,
      continuationAllowed: false,
    });
    expect(await f.supplier.createOnce(operation, password)).toEqual({
      kind: 'denied',
    });
    expect(f.create).not.toHaveBeenCalled();
  });
  it('lost create response and concurrent replay never create twice; fresh instance requires durable permission', async () => {
    const f = fixture();
    f.create.mockRejectedValue(new Error('lost response'));
    const [a, b] = await Promise.all([
      f.supplier.createOnce(operation, password),
      f.supplier.createOnce(operation, password),
    ]);
    expect([a.kind, b.kind].sort()).toEqual([
      'inspect_required',
      'provider_unknown',
    ]);
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(await f.supplier.inspect(operation)).toEqual({
      kind: 'verified',
      state: 'banned',
      continuationAllowed: true,
    });
    f.consume.mockResolvedValue(false);
    expect(
      await makeEmployeeCreationSupplier(f.deps).createOnce(operation, password)
    ).toEqual({ kind: 'inspect_required' });
    expect(f.create).toHaveBeenCalledTimes(1);
  });
  it('protects actor/target and rejects mutable client operation, extra data and changed scope', async () => {
    for (const input of [
      null,
      { ...operation, actorUserId: operation.targetUserId },
      { ...operation, operationId: '00000000-0000-4000-8000-000000000099' },
      { ...operation, targetUserId: operation.actorUserId },
      { ...operation, extra: true },
    ]) {
      const f = fixture();
      expect(await f.supplier.createOnce(input, password)).toEqual({
        kind: 'denied',
      });
      expect(f.consume).not.toHaveBeenCalled();
      expect(f.create).not.toHaveBeenCalled();
    }
  });
  it('wrong UUID/identity provider receipt never finalizes or activates another account', async () => {
    const f = fixture();
    const other = { ...banned, id: operation.actorUserId };
    f.create.mockResolvedValue(reply(other));
    f.setUser(other);
    expect(await f.supplier.createOnce(operation, password)).toEqual({
      kind: 'provider_unknown',
    });
    expect(await f.supplier.finalize(operation)).toEqual({ kind: 'denied' });
    expect(
      await f.supplier.activate(operation, {
        operation,
        receipt: { ...receipt, id: operation.actorUserId },
      })
    ).toEqual({ kind: 'denied' });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it('malformed known SQL receipt stays unknown and never implies creation', async () => {
    for (const result of [
      null,
      false,
      { ...receipt, id: operation.actorUserId },
      { ...receipt, status: 'created' },
    ]) {
      const f = fixture();
      f.execute.mockResolvedValue({ kind: 'committed', result });
      expect(await f.supplier.finalize(operation)).toEqual({
        kind: 'commit_unknown',
      });
      expect(f.update).not.toHaveBeenCalled();
    }
  });
  it.each(['revoke', 'expire'] as const)(
    'checks scope after each await; activation %s retains fact',
    async (loss) => {
      const f = fixture();
      f.consume.mockImplementation(async () => {
        f.revoke();
        return true;
      });
      expect(await f.supplier.createOnce(operation, password)).toEqual({
        kind: 'inspect_required',
      });
      expect(f.create).not.toHaveBeenCalled();
      const g = fixture();
      g.read.mockImplementation(async () => {
        g.revoke();
        return reply(banned);
      });
      expect(await g.supplier.finalize(operation)).toEqual({ kind: 'denied' });
      expect(g.execute).not.toHaveBeenCalled();
      const h = fixture();
      h.update.mockImplementation(async () => {
        h[loss]();
        return reply(active);
      });
      expect(
        await h.supplier.activate(operation, { operation, receipt })
      ).toEqual({
        kind: 'verified',
        state: 'active',
        continuationAllowed: false,
      });
      expect(h.read).toHaveBeenCalledTimes(1);
      expect(h.execute).not.toHaveBeenCalled();
      const j = fixture();
      j.create.mockImplementation(async () => {
        j.revoke();
        return reply(banned);
      });
      expect(await j.supplier.createOnce(operation, password)).toEqual({
        kind: 'verified',
        state: 'banned',
        continuationAllowed: false,
      });
    }
  );
  it('expiry during authorization denies effects; default readiness and wrong origin deny', async () => {
    const f = fixture();
    f.scope.mockImplementation(async () => {
      f.expire();
      return { ...scopeBase, operation };
    });
    expect(await f.supplier.preflight(operation)).toEqual({ kind: 'denied' });
    const g = fixture();
    g.readiness.mockResolvedValue({ kind: 'denied' });
    expect(await g.supplier.inspect(operation)).toEqual({ kind: 'denied' });
    expect(g.read).not.toHaveBeenCalled();
    const h = fixture();
    const original = { ...scopeBase, operation };
    h.scope.mockResolvedValue({
      ...original,
      origin: 'https://foreign.invalid',
    });
    expect(await h.supplier.preflight(operation)).toEqual({ kind: 'denied' });
    expect(h.execute).not.toHaveBeenCalled();
  });
  it('inspect of active lost activation confirms without repeating create or Auth activation', async () => {
    const f = fixture();
    f.setUser(active);
    expect(
      await f.supplier.activate(operation, { operation, receipt })
    ).toEqual({
      kind: 'committed',
      result: { ...receipt, status: 'created' },
      continuationAllowed: true,
    });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.execute.mock.calls.map(([v]) => v.phase)).toEqual(['confirm']);
  });
});
