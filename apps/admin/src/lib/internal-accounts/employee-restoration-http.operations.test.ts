import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeManagementError } from './employee-restoration-boundary';
import {
  type EmployeeRestorationAuthorizer,
  makeEmployeeRestorationHandlers,
} from './employee-restoration-http';
import {
  body,
  context,
  pending,
  request,
  response,
} from './employee-restoration-http-test-harness';
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
  readReply,
  restoredReceipt,
} from './employee-restoration-test-fixture';

vi.mock('server-only', () => ({}));
let f: ReturnType<typeof makeFixture>;
function beginOperationId() {
  return f.operations.begin.mock.calls[0]?.[0].operationId ?? op;
}
let authorize: ReturnType<typeof vi.fn<EmployeeRestorationAuthorizer>>;
let handlers: ReturnType<typeof makeEmployeeRestorationHandlers>;
let logs: ReturnType<typeof vi.spyOn>[];
function noEffects() {
  expect(f.getUserById).not.toHaveBeenCalled();
  expect(f.updateUserById).not.toHaveBeenCalled();
  for (const callback of Object.values(f.operations))
    expect(callback).not.toHaveBeenCalled();
}
function noRelaunch() {
  expect(f.operations.begin).not.toHaveBeenCalled();
  expect(f.operations.markAttempt).not.toHaveBeenCalled();
  expect(f.operations.confirm).not.toHaveBeenCalled();
  expect(f.updateUserById).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08'));
  logs = [
    vi.spyOn(console, 'log'),
    vi.spyOn(console, 'warn'),
    vi.spyOn(console, 'error'),
  ];
  f = makeFixture();
  authorize = vi.fn<EmployeeRestorationAuthorizer>(async () => ({
    authorized: true,
    input: {
      actorUserId: actor,
      provider: f.provider,
      operations: f.operations,
    },
  }));
  handlers = makeEmployeeRestorationHandlers(authorize);
});
afterEach(() => {
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe('actual restoration orchestration through HTTP', () => {
  it('restores only after ordered durable steps, one bound unban and fresh proof', async () => {
    const req = request(body, {
      'content-type': ' Application/JSON ; charset=utf-8',
      'x-tuturuuu-account-action': '1',
      origin: 'https://infrastructure.example.test',
      'sec-fetch-site': 'same-origin',
    });
    f.inspection.revision = 7;
    vi.spyOn(req, 'json').mockResolvedValue({ ...body, expectedRevision: 7 });
    expect(await response(await handlers.restore(req, context()), 200)).toEqual(
      {
        status: 'restored',
        account: { id, email, displayName: 'Fixture' },
        operationId: beginOperationId(),
        revision: 8,
      }
    );
    expect(f.events).toEqual([
      'actor',
      'read',
      'inspect',
      'begin',
      'markAttempt',
      'update',
      'read',
      'confirm',
    ]);
    const tuple = {
      actorUserId: actor,
      targetUserId: id,
      email,
      expectedRevision: 7,
      operationId: beginOperationId(),
    };
    for (const step of ['begin', 'markAttempt', 'confirm'] as const)
      expect(f.operations[step]).toHaveBeenCalledExactlyOnceWith(tuple);
    expect(f.updateUserById).toHaveBeenCalledExactlyOnceWith(id, {
      ban_duration: 'none',
    });
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
  it('accepts explicit native absent Origin/site without normalizing the tuple', async () => {
    await response(await handlers.restore(request(), context()), 200);
    expect(f.operations.inspect).toHaveBeenCalledExactlyOnceWith({
      actorUserId: actor,
      targetUserId: id,
      email,
    });
  });
  it('rejects caller operationId and refuses mismatched confirmation without adoption', async () => {
    await response(
      await handlers.restore(request({ ...body, operationId: op }), context()),
      400
    );
    noEffects();
    await response(
      await handlers.restore(
        request({ ...body, confirmationEmail: 'wrong@tuturuuu.com' }),
        context()
      ),
      400
    );
    expect(f.operations.begin).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
  });
  it('freshly authorizes each request and passes only its current actor', async () => {
    await response(await handlers.restore(request(), context()), 200);
    const firstOperationId = beginOperationId();
    f = makeFixture();
    f.administrator.id = otherOp;
    f.getUserById.mockImplementation(async function (
      this: typeof f.provider,
      target
    ) {
      expect(this).toBe(f.provider);
      return readReply(
        target === otherOp
          ? f.administrator
          : f.updateUserById.mock.calls.length
            ? f.active
            : f.user
      );
    });
    authorize.mockResolvedValue({
      authorized: true,
      input: {
        actorUserId: otherOp,
        provider: f.provider,
        operations: f.operations,
      },
    });
    await response(await handlers.restore(request(), context()), 200);
    expect(beginOperationId()).not.toBe(firstOperationId);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(f.getUserById.mock.calls[0]).toEqual([otherOp]);
    expect(f.operations.begin.mock.calls[0]?.[0].actorUserId).toBe(otherOp);
  });
  it('rejects a freshly disabled actor before target inspection or reservation', async () => {
    f.administrator.banned_until = '2126-01-01';
    await response(await handlers.restore(request(), context()), 403);
    expect(f.getUserById.mock.calls).toEqual([[actor]]);
    expect(f.operations.inspect).not.toHaveBeenCalled();
    expect(f.operations.begin).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
  });
  it('already active reserves and freshly confirms without mark or provider write', async () => {
    f.user.banned_until = undefined;
    await response(await handlers.restore(request(), context()), 200);
    expect(f.events).toEqual([
      'actor',
      'read',
      'inspect',
      'begin',
      'read',
      'confirm',
    ]);
    expect(f.operations.markAttempt).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
  });
  it.each(['begin', 'markAttempt', 'confirm'] as const)(
    'lost %s ACK stays pending without retry',
    async (stage) => {
      f.operations[stage].mockRejectedValue(
        Error('synthetic private lost ACK')
      );
      expect(
        await response(await handlers.restore(request(), context()), 202)
      ).toEqual(pending(true, beginOperationId()));
      expect(f.operations[stage]).toHaveBeenCalledTimes(1);
      expect(f.updateUserById).toHaveBeenCalledTimes(
        stage === 'confirm' ? 1 : 0
      );
      if (stage !== 'confirm')
        expect(f.operations.confirm).not.toHaveBeenCalled();
      if (stage === 'begin')
        expect(f.operations.markAttempt).not.toHaveBeenCalled();
    }
  );
  it.each(malformedAcks)(
    'malformed begin %j cannot authorize unban',
    async (value) => {
      f.operations.begin.mockResolvedValue(value);
      expect(
        await response(await handlers.restore(request(), context()), 202)
      ).toEqual(pending(true, beginOperationId()));
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(f.operations.markAttempt).not.toHaveBeenCalled();
    }
  );
  it('unknown provider outcome is pending after precisely one write', async () => {
    f.updateUserById.mockResolvedValue(providerError());
    expect(
      await response(await handlers.restore(request(), context()), 202)
    ).toEqual(pending(true, beginOperationId()));
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.operations.confirm).not.toHaveBeenCalled();
  });
  it('fresh still-banned state remains confirmation pending', async () => {
    f.active.banned_until = '2126-01-01';
    f.updateUserById.mockResolvedValue({
      data: { user: { ...f.user, banned_until: undefined } },
      error: null,
    });
    expect(
      await response(await handlers.restore(request(), context()), 202)
    ).toEqual(pending(false, beginOperationId()));
    expect(f.updateUserById).toHaveBeenCalledTimes(1);
    expect(f.operations.confirm).not.toHaveBeenCalled();
  });
  it('R1 getter receipt and mismatched name remain pending after one write', async () => {
    for (const fault of ['getter', 'name'] as const) {
      f = makeFixture();
      f.operations.confirm.mockImplementation(async function (
        this: typeof f.operations,
        input
      ) {
        expect(this).toBe(f.operations);
        const value = restoredReceipt(input);
        if (fault === 'getter')
          Object.defineProperty(value, 'revision', {
            get() {
              throw Error('synthetic private receipt getter');
            },
          });
        else value.displayName = 'Wrong';
        return ack(value);
      });
      expect(
        await response(await handlers.restore(request(), context()), 202)
      ).toEqual(pending(true, beginOperationId()));
      expect(f.updateUserById).toHaveBeenCalledTimes(1);
      expect(f.operations.confirm).toHaveBeenCalledTimes(1);
    }
  });
});

describe('actual reconciliation through HTTP never relaunches', () => {
  afterEach(noRelaunch);
  it('named completed replay preserves original revision and exact tuple', async () => {
    f.user.banned_until = undefined;
    f.inspection.revision = 8;
    f.inspection.operation = {
      operationId: op,
      revision: 7,
      phase: 'completed',
    };
    const req = () =>
      request({ ...body, expectedRevision: 7, operationId: op });
    const first = await response(
      await handlers.reconcile(req(), context()),
      200
    );
    expect(first).toEqual(
      await response(await handlers.reconcile(req(), context()), 200)
    );
    expect(first).toEqual({
      status: 'restored',
      account: { id, email, displayName: 'Fixture' },
      operationId: op,
      revision: 8,
    });
    expect(f.operations.reconcile.mock.calls.map(([args]) => args)).toEqual(
      [0, 1].map(() => ({
        actorUserId: actor,
        targetUserId: id,
        email,
        expectedRevision: 7,
        operationId: op,
      }))
    );
    expect(f.inspection.revision).toBe(8);
  });
  it('named nonbound target is pending without semantic reconciliation', async () => {
    expect(
      await response(
        await handlers.reconcile(
          request({ ...body, operationId: op }),
          context()
        ),
        202
      )
    ).toEqual(pending(false));
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
  it.each(['inspect', 'reconcile'] as const)(
    'named lost %s remains pending without retry',
    async (stage) => {
      f.user.banned_until = undefined;
      f.operations[stage].mockRejectedValue(
        Error('synthetic private lost reconcile')
      );
      expect(
        await response(
          await handlers.reconcile(
            request({ ...body, operationId: op }),
            context()
          ),
          202
        )
      ).toEqual(pending());
      expect(f.operations[stage]).toHaveBeenCalledTimes(1);
    }
  );
  it.each(malformedAcks)(
    'named malformed reconcile ACK %j stays pending',
    async (value) => {
      f.user.banned_until = undefined;
      f.operations.reconcile.mockResolvedValue(value);
      expect(
        await response(
          await handlers.reconcile(
            request({ ...body, operationId: op }),
            context()
          ),
          202
        )
      ).toEqual(pending());
      expect(f.operations.reconcile).toHaveBeenCalledTimes(1);
    }
  );
  it.each(definiteCodes)(
    'named reconcile denial %s retains fixed %s',
    async (code, status) => {
      f.user.banned_until = undefined;
      f.operations.reconcile.mockResolvedValue(denial(code));
      const value = await response(
        await handlers.reconcile(
          request({ ...body, operationId: op }),
          context()
        ),
        status
      );
      expect(value.message).toBe('Employee management could not be verified');
    }
  );
  it('named R1 receipt getter is pending, never a definite permission denial', async () => {
    f.user.banned_until = undefined;
    f.operations.reconcile.mockResolvedValue(
      ack(
        Object.defineProperty(
          restoredReceipt({
            actorUserId: actor,
            targetUserId: id,
            email,
            expectedRevision: 0,
            operationId: op,
          }),
          'revision',
          {
            get() {
              throw new EmployeeManagementError(
                'employee_management_forbidden',
                403
              );
            },
          }
        )
      )
    );
    expect(
      await response(
        await handlers.reconcile(
          request({ ...body, operationId: op }),
          context()
        ),
        202
      )
    ).toEqual(pending());
  });
  it('unnamed authorized observation retains recovery as observation, separate from activation', async () => {
    expect(
      await response(await handlers.reconcile(request(), context()), 200, true)
    ).toEqual({
      status: 'observed',
      observation: { ...f.inspection, providerState: 'confirmed_banned' },
      nextAction: 'restore',
    });
    expect(f.events).toEqual(['actor', 'read', 'inspect']);
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
  it('unnamed unresolved operation remains pending without allocating a new id', async () => {
    f.inspection.operation = {
      operationId: otherOp,
      revision: 0,
      phase: 'attempted',
    };
    expect(
      await response(await handlers.reconcile(request(), context()), 202)
    ).toEqual(pending(false, otherOp));
    expect(f.operations.reconcile).not.toHaveBeenCalled();
  });
  it('rejects malformed optional named UUID before service', async () => {
    await response(
      await handlers.reconcile(
        request({ ...body, operationId: 'invalid' }),
        context()
      ),
      400
    );
    noEffects();
  });
});
