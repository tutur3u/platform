import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmployeeManagementError,
  type Inspection,
} from './employee-restoration-boundary';
import { reconcileEmployeeAccess } from './employee-restoration-orchestration';
import {
  ack,
  actor,
  definiteCodes,
  denial,
  email,
  id,
  makeFixture,
  malformedAcks,
  op,
  otherOp,
  providerError,
  restoredReceipt,
  type User,
} from './employee-restoration-test-fixture';

vi.mock('server-only', () => ({}));
vi.mock('node:crypto', () => ({ randomUUID: vi.fn() }));
let f: ReturnType<typeof makeFixture>;
beforeEach(() => {
  vi.mocked(randomUUID).mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08'));
  f = makeFixture();
});
afterEach(() => {
  expect(f.operations.begin).not.toHaveBeenCalled();
  expect(f.operations.markAttempt).not.toHaveBeenCalled();
  expect(f.operations.confirm).not.toHaveBeenCalled();
  expect(f.updateUserById).not.toHaveBeenCalled();
  expect(randomUUID).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
const pending = (uncertain = true, operationId = op) => ({
  status: 'pending',
  operationId,
  nextAction: 'inspect',
  code: uncertain
    ? 'employee_restore_outcome_unknown'
    : 'employee_restore_confirmation_pending',
  message:
    'Employee restoration is pending. Inspect this operation before taking another action.',
});
const named = () => ({ ...f.input, operationId: op });
const active = () => {
  f.user.banned_until = undefined;
};
function targetFailure(mode: 'throw' | 'error' | 'missing') {
  const original = f.getUserById.getMockImplementation()!;
  f.getUserById.mockImplementation(async (target) => {
    if (target === actor) return original.call(f.provider, target);
    if (mode === 'throw') throw Error('synthetic private lost read');
    return providerError(
      mode === 'missing' ? 404 : 503,
      mode === 'missing' ? 'user_not_found' : 'unexpected_failure'
    );
  });
}

describe('named and unnamed reconciliation preserve separate catches', () => {
  it('closes only a named existing verified receipt using the original revision', async () => {
    active();
    expect(await reconcileEmployeeAccess(named())).toEqual({
      status: 'restored',
      account: { id, email, displayName: 'Fixture' },
      operationId: op,
      revision: 1,
    });
    expect(f.events).toEqual(['actor', 'read', 'inspect', 'reconcile']);
    expect(f.operations.reconcile).toHaveBeenCalledExactlyOnceWith({
      actorUserId: actor,
      targetUserId: id,
      email,
      expectedRevision: 0,
      operationId: op,
    });
    expect(f.getUserById.mock.calls).toEqual([[actor], [id]]);
  });
  it('matching completed replay returns identical receipt, never borrows inspection revision', async () => {
    active();
    f.inspection.revision = 1;
    f.inspection.operation = {
      operationId: op,
      phase: 'completed',
      revision: 0,
    };
    const first = await reconcileEmployeeAccess(named());
    expect(first).toEqual(await reconcileEmployeeAccess(named()));
    expect(first).toMatchObject({ revision: 1, operationId: op });
    expect(f.operations.reconcile).toHaveBeenCalledTimes(2);
    expect(
      f.operations.reconcile.mock.calls.map(([args]) => args.expectedRevision)
    ).toEqual([0, 0]);
    expect(f.inspection.revision).toBe(1);
  });
  it.each([
    { banned_until: '2126-01-01' },
    { banned_until: 'unknown' },
    { email_confirmed_at: undefined },
    { app_metadata: {} },
    { app_metadata: { employee_onboarding: 'true' } },
  ] satisfies Partial<User>[])(
    'named nonbound/inactive target %j stays pending without reconcile',
    async (patch) => {
      Object.assign(f.user, patch);
      expect(await reconcileEmployeeAccess(named())).toEqual(pending(false));
      expect(f.operations.reconcile).not.toHaveBeenCalled();
    }
  );
  it('named missing target with existing canonical registry stays confirmation pending', async () => {
    targetFailure('missing');
    expect(await reconcileEmployeeAccess(named())).toEqual(pending(false));
    expect(f.operations.inspect).toHaveBeenCalledExactlyOnceWith({
      actorUserId: actor,
      targetUserId: id,
      email: null,
    });
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
  for (const stage of ['inspect', 'reconcile'] as const) {
    it.each(definiteCodes)(
      `named ${stage} definite %s remains %s`,
      async (code, status) => {
        active();
        f.operations[stage].mockResolvedValue(denial(code));
        await expect(reconcileEmployeeAccess(named())).rejects.toMatchObject({
          status,
        });
        if (stage === 'inspect')
          expect(f.operations.reconcile).not.toHaveBeenCalled();
      }
    );
    it.each([...malformedAcks, denial('PGRST202'), ack({})])(
      `named ${stage} unknown/malformed %j remains pending`,
      async (value) => {
        active();
        f.operations[stage].mockResolvedValue(value);
        expect(await reconcileEmployeeAccess(named())).toEqual(pending());
      }
    );
    it(`named ${stage} lost acknowledgement remains pending`, async () => {
      active();
      f.operations[stage].mockRejectedValue(
        Error('synthetic private transport')
      );
      expect(await reconcileEmployeeAccess(named())).toEqual(pending());
    });
  }
  it.each([...malformedAcks, denial('PGRST202'), ack({})])(
    'unnamed inspection uncertainty %j is thrown, never converted into a pending invented id',
    async (value) => {
      f.operations.inspect.mockResolvedValue(value);
      await expect(reconcileEmployeeAccess(f.input)).rejects.toMatchObject({
        status: 503,
      });
      expect(f.operations.reconcile).not.toHaveBeenCalled();
    }
  );
  it('unnamed inspection lost acknowledgement remains thrown', async () => {
    f.operations.inspect.mockRejectedValue(Error('private lost inspection'));
    await expect(reconcileEmployeeAccess(f.input)).rejects.toMatchObject({
      status: 503,
    });
  });
  it.each(definiteCodes)(
    'unnamed inspection denial %s remains %s',
    async (code, status) => {
      f.operations.inspect.mockResolvedValue(denial(code));
      await expect(reconcileEmployeeAccess(f.input)).rejects.toMatchObject({
        status,
      });
    }
  );
  for (const mode of ['throw', 'error'] as const) {
    it(`named target ${mode} stays pending before inspection`, async () => {
      targetFailure(mode);
      expect(await reconcileEmployeeAccess(named())).toEqual(pending());
      expect(f.operations.inspect).not.toHaveBeenCalled();
      expect(f.operations.reconcile).not.toHaveBeenCalled();
    });
    it(`unnamed target ${mode} is thrown before inspection`, async () => {
      targetFailure(mode);
      await expect(reconcileEmployeeAccess(f.input)).rejects.toMatchObject({
        status: 503,
      });
      expect(f.operations.inspect).not.toHaveBeenCalled();
    });
    it(`named actor ${mode} is thrown before target, outside pending catches`, async () => {
      if (mode === 'throw')
        f.getUserById.mockRejectedValue(Error('private actor uncertainty'));
      else f.getUserById.mockResolvedValue(providerError());
      await expect(reconcileEmployeeAccess(named())).rejects.toMatchObject({
        status: 503,
      });
      expect(f.getUserById.mock.calls).toEqual([[actor]]);
      expect(f.operations.inspect).not.toHaveBeenCalled();
    });
  }
  it.each([
    { id: otherOp },
    { email: 'external@example.test' },
    { email_confirmed_at: undefined },
    { banned_until: '2126-01-01' },
    { banned_until: 'unknown' },
  ] satisfies Partial<User>[])(
    'named actor denial %j is thrown before target',
    async (patch) => {
      Object.assign(f.administrator, patch);
      await expect(reconcileEmployeeAccess(named())).rejects.toMatchObject({
        status: 403,
      });
      expect(f.getUserById.mock.calls).toEqual([[actor]]);
      expect(f.operations.inspect).not.toHaveBeenCalled();
    }
  );
  it('foreign provider UUID is definite 409 even when named', async () => {
    f.user.id = otherOp;
    await expect(reconcileEmployeeAccess(named())).rejects.toMatchObject({
      status: 409,
    });
    expect(f.operations.inspect).not.toHaveBeenCalled();
  });
  it('named wrong confirmation remains definite 400', async () => {
    await expect(
      reconcileEmployeeAccess({
        ...named(),
        confirmationEmail: 'wrong@tuturuuu.com',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
  it.each([
    { operationId: 'invalid' },
    { targetUserId: 'invalid' },
    { expectedRevision: -1 },
    { expectedRevision: Number.MAX_SAFE_INTEGER },
    { confirmationEmail: 'foreign@example.test' },
  ])('invalid named input %j is rejected before actor', async (patch) => {
    await expect(
      reconcileEmployeeAccess({ ...named(), ...patch })
    ).rejects.toMatchObject({ status: 400 });
    expect(f.getUserById).not.toHaveBeenCalled();
  });
  it('self action stops before any provider read', async () => {
    await expect(
      reconcileEmployeeAccess({ ...named(), actorUserId: id })
    ).rejects.toMatchObject({ status: 409 });
    expect(f.getUserById).not.toHaveBeenCalled();
  });
  it.each([
    { id: otherOp },
    { email: 'foreign@tuturuuu.com' },
    { displayName: 'Foreign fixture' },
    { displayName: '' },
    { revision: 2 },
    { operationId: otherOp },
    { status: 'pending' },
    { extra: true },
  ])(
    'named strict receipt mismatch %j stays unknown pending',
    async (patch) => {
      active();
      f.operations.reconcile.mockImplementation(async (args) =>
        ack({ ...restoredReceipt(args), ...patch })
      );
      expect(await reconcileEmployeeAccess(named())).toEqual(pending());
    }
  );
  it.each([
    { name: 'ordinary Error', error: new Error('synthetic receipt getter') },
    {
      name: 'EmployeeManagementError403',
      error: new EmployeeManagementError('synthetic_payload_code', 403),
    },
    {
      name: 'EmployeeManagementError404',
      error: new EmployeeManagementError('synthetic_payload_code', 404),
    },
    {
      name: 'EmployeeManagementError409',
      error: new EmployeeManagementError('synthetic_payload_code', 409),
    },
  ])(
    'named receipt own getter throwing $name stays exact unknown pending',
    async ({ error }) => {
      active();
      const getter = vi.fn(() => {
        throw error;
      });
      f.operations.reconcile.mockImplementation(async (args) => {
        f.events.push('reconcile');
        return ack({
          ...restoredReceipt(args),
          get revision() {
            return getter();
          },
        });
      });
      expect(await reconcileEmployeeAccess(named())).toEqual(pending());
      expect(getter).toHaveBeenCalled();
      expect(f.events).toEqual(['actor', 'read', 'inspect', 'reconcile']);
      expect(f.operations.reconcile).toHaveBeenCalledExactlyOnceWith({
        actorUserId: actor,
        targetUserId: id,
        email,
        expectedRevision: 0,
        operationId: op,
      });
      expect(f.operations.begin).not.toHaveBeenCalled();
      expect(f.operations.markAttempt).not.toHaveBeenCalled();
      expect(f.operations.confirm).not.toHaveBeenCalled();
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(randomUUID).not.toHaveBeenCalled();
    }
  );
  it.each(['reserved', 'attempted', 'unknown'] as const)(
    'unnamed unresolved %s retains the inspected existing id without closing or retrying',
    async (phase) => {
      f.inspection.operation = { operationId: otherOp, revision: 0, phase };
      expect(await reconcileEmployeeAccess(f.input)).toEqual(
        pending(false, otherOp)
      );
      expect(f.operations.reconcile).not.toHaveBeenCalled();
    }
  );
  it.each([1, 2])(
    'unnamed revision %s differs and stays definite 409',
    async (revision) => {
      f.inspection.revision = revision;
      await expect(reconcileEmployeeAccess(f.input)).rejects.toMatchObject({
        status: 409,
      });
      expect(f.operations.reconcile).not.toHaveBeenCalled();
    }
  );
  it.each([
    [
      {
        registryState: 'pending',
        readinessCode: 'creation_pending',
        mailboxReady: false,
      },
      'creation_reconciliation_required',
    ],
    [
      { registryState: 'provisioned', readinessCode: 'creation_pending' },
      'creation_reconciliation_required',
    ],
    [
      {
        registryState: 'absent',
        reservation: 'exact_intent',
        readinessCode: 'not_managed',
      },
      'creation_reconciliation_required',
    ],
    [
      {
        registryState: 'absent',
        reservation: 'none',
        readinessCode: 'not_managed',
        managed: false,
      },
      'manual_review',
    ],
    [
      { reservation: 'conflicting_tuple', readinessCode: 'tuple_conflict' },
      'manual_review',
    ],
    [{ mailboxReady: false }, 'manual_review'],
  ] satisfies [Partial<Inspection>, string][])(
    'classifies observation %j without provisioning',
    async (patch, nextAction) => {
      Object.assign(f.inspection, patch);
      expect(await reconcileEmployeeAccess(f.input)).toMatchObject({
        status: 'observed',
        nextAction,
      });
      expect(f.events).toEqual(['actor', 'read', 'inspect']);
      expect(f.operations.reconcile).not.toHaveBeenCalled();
    }
  );
  it('unmarked ordinary staff only receives an adoption label', async () => {
    Object.assign(f.inspection, {
      registryState: 'absent',
      managed: false,
      reservation: 'none',
      readinessCode: 'not_managed',
    });
    f.user.app_metadata = { employee_onboarding: false };
    expect(await reconcileEmployeeAccess(f.input)).toMatchObject({
      status: 'observed',
      nextAction: 'adoption_required',
    });
    expect(f.events).toEqual(['actor', 'read', 'inspect']);
  });
  it('missing provider retains exact UUID intent, never looks up by email', async () => {
    targetFailure('missing');
    Object.assign(f.inspection, {
      registryState: 'absent',
      managed: true,
      reservation: 'exact_intent',
      readinessCode: 'not_managed',
    });
    expect(await reconcileEmployeeAccess(f.input)).toMatchObject({
      status: 'observed',
      nextAction: 'creation_reconciliation_required',
      observation: { providerState: 'missing' },
    });
    expect(f.operations.inspect).toHaveBeenCalledExactlyOnceWith({
      actorUserId: actor,
      targetUserId: id,
      email: null,
    });
    expect(f.getUserById.mock.calls).toEqual([[actor], [id]]);
  });
  it('unnamed absent provider/registry/intent is definite 404', async () => {
    targetFailure('missing');
    Object.assign(f.inspection, {
      email: null,
      registryState: 'absent',
      reservation: 'none',
    });
    await expect(reconcileEmployeeAccess(f.input)).rejects.toMatchObject({
      status: 404,
    });
  });
  it.each([
    { id: actor },
    { email: 'wrong@tuturuuu.com' },
    { revision: -1 },
    { managed: 'yes' },
  ])(
    'malformed inspection %j stays unknown pending named and unavailable unnamed',
    async (patch) => {
      f.operations.inspect.mockResolvedValue(
        ack({ ...f.inspection, ...patch })
      );
      expect(await reconcileEmployeeAccess(named())).toEqual(pending());
      await expect(reconcileEmployeeAccess(f.input)).rejects.toMatchObject({
        status: 503,
      });
    }
  );
  it('observed projection retains authorized private recovery only here, without logs', async () => {
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    const observed = await reconcileEmployeeAccess(f.input);
    expect(observed).toEqual({
      status: 'observed',
      observation: { ...f.inspection, providerState: 'confirmed_banned' },
      nextAction: 'restore',
    });
    active();
    const restored = await reconcileEmployeeAccess(named());
    f.operations.reconcile.mockResolvedValue(denial('UNKNOWN'));
    const uncertain = await reconcileEmployeeAccess(named());
    expect(uncertain).toEqual(pending());
    for (const output of [restored, uncertain])
      expect(JSON.stringify(output)).not.toMatch(
        /private-recovery|private diagnostic|recovery|password|details/
      );
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
  it('provider email disagreement with inspection is uncertainty, never canonical fallback', async () => {
    f.user.email = 'drift@tuturuuu.com';
    expect(await reconcileEmployeeAccess(named())).toEqual(pending());
    expect(f.operations.inspect).toHaveBeenCalledExactlyOnceWith({
      actorUserId: actor,
      targetUserId: id,
      email: f.user.email,
    });
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
  it('matching foreign canonical email still fails explicit confirmation with 400', async () => {
    f.user.email = 'drift@tuturuuu.com';
    f.inspection.email = f.user.email;
    await expect(reconcileEmployeeAccess(named())).rejects.toMatchObject({
      status: 400,
    });
  });
  it('active unnamed observation has no closure side effect', async () => {
    active();
    expect(await reconcileEmployeeAccess(f.input)).toMatchObject({
      status: 'observed',
      nextAction: 'none',
    });
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
});
