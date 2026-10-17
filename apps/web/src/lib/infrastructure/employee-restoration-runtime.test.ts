import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  actor,
  context,
  email,
  inspection,
  operationId,
  request,
  restorationFixture,
  target,
} from './employee-restoration-test-fixture';

vi.mock('server-only', () => ({}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(),
}));

import { createEmployeeRestorationRequestHandlers } from './employee-restoration-runtime';

let fixture: Awaited<ReturnType<typeof restorationFixture>>;
beforeEach(async () => {
  fixture = await restorationFixture();
});
afterEach(async () => {
  await fixture.close();
});
const run = () =>
  createEmployeeRestorationRequestHandlers(fixture.deps).restore(
    request(),
    context()
  );

it('restores only after persisted begin and attempt, then observes completed state', async () => {
  const response = await run();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: 'restored',
    account: { id: target, email },
    revision: 1,
  });
  expect(fixture.events).toEqual([
    'provider:actor',
    'provider:read',
    'inspect_employee_management',
    'begin_employee_restore',
    'inspect_employee_management',
    'mark_employee_restore_attempt',
    'inspect_employee_management',
    'provider:update',
    'provider:read',
    'confirm_employee_restore',
    'inspect_employee_management',
  ]);
  expect(fixture.provider.updateUserById).toHaveBeenCalledExactlyOnceWith(
    target,
    { ban_duration: 'none' }
  );
  expect(fixture.authorize.mock.calls.length).toBeGreaterThan(
    fixture.events.length
  );
  expect(response.headers.get('cache-control')).toContain('no-store');
});
it.each(['unpersisted', 'rollback', 'missing-readback', 'stale-readback'])(
  'keeps %s reservation unknown without provider dispatch',
  async (mode) => {
    fixture.setMode(mode);
    const response = await run();
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      status: 'pending',
      nextAction: 'inspect',
      operationId: expect.any(String),
    });
    expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
  }
);
it('defaults disabled before configuration, SQL or provider construction', async () => {
  fixture.setEnabled(false);
  const configuration = vi.fn(fixture.deps.configuration);
  const provider = vi.fn(fixture.deps.provider);
  const response = await createEmployeeRestorationRequestHandlers({
    ...fixture.deps,
    configuration,
    provider,
  }).restore(request(), context());
  expect(response.status).toBe(503);
  expect(configuration).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  expect(fixture.calls).toEqual([]);
});
it('denies invalid input and cross-origin writes without account effects', async () => {
  const handlers = createEmployeeRestorationRequestHandlers(fixture.deps);
  expect(
    (
      await handlers.restore(
        request({
          confirmationEmail: email,
          expectedRevision: 0,
          actorUserId: target,
        }),
        context()
      )
    ).status
  ).toBe(400);
  const crossOrigin = request();
  crossOrigin.headers.set('origin', 'https://foreign.test');
  expect((await handlers.restore(crossOrigin, context())).status).toBe(403);
  expect(fixture.calls).toEqual([]);
  expect(fixture.provider.getUserById).not.toHaveBeenCalled();
});
it('rejects self restoration before provider reads, updates or SQL transport', async () => {
  const response = await createEmployeeRestorationRequestHandlers(
    fixture.deps
  ).restore(request({ confirmationEmail: email, expectedRevision: 0 }), {
    params: Promise.resolve({ userId: actor }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: 'employee_self_action' });
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(fixture.authorize).toHaveBeenCalledOnce();
  expect(fixture.provider.getUserById).not.toHaveBeenCalled();
  expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
  expect(fixture.calls).toEqual([]);
});
it.each([
  ['127.0.0.1', 403, 'forbidden'],
  ['localhost', 409, 'employee_self_action'],
])(
  'checks the normalized Next origin before self action for %s',
  async (host, status, code) => {
    const origin = `http://${host}:1777`;
    const incoming = new NextRequest(`${origin}/api/restore`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tuturuuu-account-action': '1',
        origin,
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ confirmationEmail: email, expectedRevision: 0 }),
    });
    expect(new URL(incoming.url).origin).toBe('http://localhost:1777');
    const response = await createEmployeeRestorationRequestHandlers(
      fixture.deps
    ).restore(incoming, { params: Promise.resolve({ userId: actor }) });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fixture.authorize).toHaveBeenCalledOnce();
    expect(fixture.provider.getUserById).not.toHaveBeenCalled();
    expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
    expect(fixture.calls).toEqual([]);
  }
);
it('stops a revoked actor before attempt/provider dispatch', async () => {
  fixture.setRevokeAt('begin_employee_restore');
  expect((await run()).status).toBe(403);
  expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
  expect(
    fixture.calls.filter(({ name }) => name === 'mark_employee_restore_attempt')
  ).toEqual([]);
});
it('retains unknown provider outcome and never automatically replays it', async () => {
  fixture.setFailAt('provider:update');
  const response = await run();
  expect(response.status).toBe(202);
  const result = await response.json();
  expect(result).toMatchObject({
    status: 'pending',
    code: 'employee_restore_outcome_unknown',
  });
  expect(fixture.provider.updateUserById).toHaveBeenCalledTimes(1);
  const handlers = createEmployeeRestorationRequestHandlers(fixture.deps);
  const reconciled = await handlers.reconcile(
    request({
      confirmationEmail: email,
      expectedRevision: 0,
      operationId: result.operationId,
    }),
    context()
  );
  expect(reconciled.status).toBe(200);
  expect(await reconciled.json()).toMatchObject({
    status: 'restored',
    operationId: result.operationId,
  });
  expect(fixture.provider.updateUserById).toHaveBeenCalledTimes(1);
});
it('a second RESTORE inspects the unresolved UUID instead of relaunching', async () => {
  fixture.setFailAt('provider:update');
  await run();
  const response = await run();
  expect(response.status).toBe(409);
  expect(fixture.provider.updateUserById).toHaveBeenCalledTimes(1);
});
it('reconciliation observes a still-banned target without a provider write', async () => {
  fixture.setObservation({
    ...inspection,
    operation: { operationId, revision: 0, phase: 'attempted' },
  });
  const response = await createEmployeeRestorationRequestHandlers(
    fixture.deps
  ).reconcile(
    request({ confirmationEmail: email, expectedRevision: 0, operationId }),
    context()
  );
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    operationId,
    nextAction: 'inspect',
  });
  expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
  expect(fixture.calls.map(({ name }) => name)).toEqual([
    'inspect_employee_management',
  ]);
});
it('rechecks authority after provider dispatch and suppresses private success', async () => {
  fixture.setRevokeAt('provider:update');
  const response = await run();
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain(email);
  expect(fixture.provider.updateUserById).toHaveBeenCalledTimes(1);
});

it('does not dispatch provider work when attempted state is not persisted', async () => {
  fixture.setMode('unpersisted', 'mark_employee_restore_attempt');
  const response = await run();
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    status: 'pending',
    nextAction: 'inspect',
  });
  expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
  expect(
    fixture.calls.filter(({ name }) => name === 'mark_employee_restore_attempt')
  ).toHaveLength(1);
});
it('retains the original operation when the attempted acknowledgement is lost', async () => {
  fixture.setFailAt('mark_employee_restore_attempt');
  const response = await run();
  expect(response.status).toBe(202);
  const result = await response.json();
  expect(result.operationId).toBe(
    fixture.calls.find(({ name }) => name === 'begin_employee_restore')?.body
      .p_operation_id
  );
  expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
});
it('does not publish success when confirmation readback disagrees', async () => {
  fixture.setMode('unpersisted', 'confirm_employee_restore');
  const response = await run();
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    code: 'employee_restore_outcome_unknown',
  });
  expect(fixture.provider.updateUserById).toHaveBeenCalledTimes(1);
});
it('rechecks actor immediately before provider dispatch after a durable attempt', async () => {
  fixture.afterAttemptReadback(() => fixture.setAuthorized(false));
  expect((await run()).status).toBe(403);
  expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
});
it('preserves unavailable authorization as a 503 without private disclosure', async () => {
  const authorize = vi.fn(fixture.deps.authorize);
  fixture.afterAttemptReadback(() => {
    authorize.mockImplementation(async () => {
      throw Error('authority unavailable');
    });
  });
  const response = await createEmployeeRestorationRequestHandlers({
    ...fixture.deps,
    authorize,
  }).restore(request(), context());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain(email);
  expect(fixture.provider.updateUserById).not.toHaveBeenCalled();
});
