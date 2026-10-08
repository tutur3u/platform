import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeManagementError } from './employee-restoration-boundary';
import {
  type EmployeeRestorationAuthorizer,
  type EmployeeRestorationContext,
  makeEmployeeRestorationHandlers,
} from './employee-restoration-http';
import {
  actor,
  definiteCodes,
  denial,
  email,
  id,
  makeFixture,
  op,
} from './employee-restoration-test-fixture';

import {
  body,
  context,
  request,
  response,
} from './employee-restoration-http-test-harness';

vi.mock('server-only', () => ({}));
vi.mock('node:crypto', () => ({ randomUUID: vi.fn() }));
let f: ReturnType<typeof makeFixture>;
let authorize: ReturnType<typeof vi.fn<EmployeeRestorationAuthorizer>>;
let handlers: ReturnType<typeof makeEmployeeRestorationHandlers>;
let logs: ReturnType<typeof vi.spyOn>[];
function throwingParams(): EmployeeRestorationContext['params'] {
  function fail(): never {
    throw Error('synthetic private params');
  }
  const then: EmployeeRestorationContext['params']['then'] = fail;
  return Object.defineProperty({}, 'then', {
    value: then,
    writable: true,
    enumerable: true,
    configurable: true,
  }) as EmployeeRestorationContext['params'];
}
function noEffects() {
  expect(f.getUserById).not.toHaveBeenCalled();
  expect(f.updateUserById).not.toHaveBeenCalled();
  for (const callback of Object.values(f.operations))
    expect(callback).not.toHaveBeenCalled();
  expect(randomUUID).not.toHaveBeenCalled();
}
beforeEach(() => {
  vi.mocked(randomUUID).mockReset().mockReturnValue(op);
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

for (const action of ['restore', 'reconcile'] as const) {
  describe(`${action} unwired HTTP request boundary`, () => {
    it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])(
      'returns private 405 for %s before authorization or params',
      async (method) => {
        const params = throwingParams();
        expect(
          await response(
            await handlers[action](request(body, undefined, method), {
              params,
            }),
            405
          )
        ).toEqual({
          code: 'method_not_allowed',
          message: 'Method not allowed',
        });
        expect(authorize).not.toHaveBeenCalled();
        noEffects();
      }
    );
    it('construction has zero effects and authorization precedes headers/body/params', async () => {
      expect(authorize).not.toHaveBeenCalled();
      noEffects();
      const req = request({}, { 'content-type': 'wrong' });
      const json = vi.spyOn(req, 'json');
      authorize.mockResolvedValue({ authorized: false, status: 401 });
      const params = throwingParams();
      expect(
        await response(await handlers[action](req, { params }), 401)
      ).toEqual({ code: 'unauthorized', message: 'Unauthorized' });
      expect(authorize).toHaveBeenCalledExactlyOnceWith(req);
      expect(json).not.toHaveBeenCalled();
      noEffects();
    });
    it.each([401, 403, 503] as const)(
      'reconstructs fixed authorization denial %s',
      async (status) => {
        authorize.mockImplementation(async () => ({
          authorized: false,
          status,
          message: 'synthetic private authority',
          headers: { 'set-cookie': 'synthetic private cookie' },
        }));
        await response(await handlers[action](request(), context()), status);
        noEffects();
      }
    );
    it('contains a rejected authorizer as unavailable', async () => {
      authorize.mockRejectedValue(Error('synthetic private permission'));
      expect(
        await response(await handlers[action](request(), context()), 503)
      ).toEqual({
        code: 'employee_management_unavailable',
        message: 'Employee management could not be verified',
      });
      noEffects();
    });
    it('contains authorization getters and out-of-contract denial statuses', async () => {
      const grant = { authorized: true as const, input: f.input };
      Object.defineProperty(grant, 'input', {
        get() {
          throw new EmployeeManagementError(
            'employee_management_forbidden',
            403
          );
        },
      });
      authorize.mockResolvedValueOnce(grant);
      await response(await handlers[action](request(), context()), 503);
      const denied = { authorized: false as const, status: 403 as const };
      Object.defineProperty(denied, 'status', { value: 418 });
      authorize.mockResolvedValueOnce(denied);
      await response(await handlers[action](request(), context()), 503);
      noEffects();
    });
    it.each([
      '',
      'not-a-uuid',
      `${actor} `,
      actor.replace('10000000', 'ABCDEF00'),
    ])(
      'rejects malformed granted actor %s before request or service effects',
      async (actorUserId) => {
        authorize.mockResolvedValue({
          authorized: true,
          input: {
            actorUserId,
            provider: f.provider,
            operations: f.operations,
          },
        });
        const req = request();
        const json = vi.spyOn(req, 'json');
        const headers = vi.spyOn(req.headers, 'get');
        const params = throwingParams();
        expect(
          await response(await handlers[action](req, { params }), 503)
        ).toEqual({
          code: 'employee_management_unavailable',
          message: 'Employee management could not be verified',
        });
        expect(authorize).toHaveBeenCalledExactlyOnceWith(req);
        expect(headers).not.toHaveBeenCalled();
        expect(json).not.toHaveBeenCalled();
        noEffects();
      }
    );
    for (const key of [
      'input',
      'actorUserId',
      'provider',
      'operations',
    ] as const) {
      it.each([undefined, null, {}, 0])(
        `rejects malformed or missing granted ${key} before request effects: %j`,
        async (value) => {
          const input = {
            actorUserId: actor,
            provider: f.provider,
            operations: f.operations,
          };
          const grant = { authorized: true as const, input };
          Object.defineProperty(key === 'input' ? grant : input, key, {
            value,
          });
          authorize.mockResolvedValue(grant);
          const req = request();
          const json = vi.spyOn(req, 'json');
          expect(
            await response(await handlers[action](req, context()), 503)
          ).toEqual({
            code: 'employee_management_unavailable',
            message: 'Employee management could not be verified',
          });
          expect(json).not.toHaveBeenCalled();
          noEffects();
        }
      );
    }
    for (const group of ['provider', 'operations'] as const) {
      const methods =
        group === 'provider'
          ? ['getUserById', 'updateUserById']
          : ['inspect', 'begin', 'markAttempt', 'confirm', 'reconcile'];
      for (const method of methods) {
        it.each([undefined, null, 'unavailable', {}])(
          `rejects noncallable granted ${group}.${method} before all effects: %j`,
          async (value) => {
            const input = {
              actorUserId: actor,
              provider: { ...f.provider },
              operations: { ...f.operations },
            };
            Object.defineProperty(input[group], method, { value });
            authorize.mockResolvedValue({ authorized: true, input });
            const req = request();
            const json = vi.spyOn(req, 'json');
            await response(await handlers[action](req, context()), 503);
            expect(json).not.toHaveBeenCalled();
            noEffects();
          }
        );
      }
    }
    it.each([
      'input',
      'actorUserId',
      'provider',
      'operations',
      'getUserById',
      'inspect',
    ] as const)(
      'contains throwing granted %s getter as fixed unavailable',
      async (key) => {
        const input = {
          actorUserId: actor,
          provider: { ...f.provider },
          operations: { ...f.operations },
        };
        const grant = { authorized: true as const, input };
        const receiver =
          key === 'input'
            ? grant
            : key === 'getUserById'
              ? input.provider
              : key === 'inspect'
                ? input.operations
                : input;
        const getter = vi.fn(() => {
          throw new EmployeeManagementError(
            'employee_management_forbidden',
            403
          );
        });
        Object.defineProperty(receiver, key, { get: getter });
        authorize.mockResolvedValue(grant);
        const req = request();
        const json = vi.spyOn(req, 'json');
        expect(
          await response(await handlers[action](req, context()), 503)
        ).toEqual({
          code: 'employee_management_unavailable',
          message: 'Employee management could not be verified',
        });
        expect(getter).toHaveBeenCalledTimes(1);
        expect(json).not.toHaveBeenCalled();
        noEffects();
      }
    );
    it('snapshots each grant field and callback once with original method receivers', async () => {
      const input = {
        actorUserId: actor,
        provider: f.provider,
        operations: f.operations,
      };
      const grant = { authorized: true as const, input };
      const callbacks = { ...f.operations };
      const getters: ReturnType<typeof vi.fn>[] = [];
      function tracked(receiver: object, key: string, value: unknown) {
        const get = vi.fn(() => value);
        getters.push(get);
        Object.defineProperty(receiver, key, { get, configurable: true });
      }
      tracked(grant, 'authorized', true);
      tracked(grant, 'input', input);
      for (const [key, value] of Object.entries(input))
        tracked(input, key, value);
      for (const [key, value] of Object.entries(f.provider))
        tracked(f.provider, key, value);
      for (const [key, value] of Object.entries(f.operations))
        tracked(f.operations, key, value);
      authorize.mockResolvedValue(grant);
      const req = request();
      vi.spyOn(req, 'json').mockImplementation(async () => {
        for (const receiver of [grant, input, f.provider, f.operations]) {
          for (const key of Object.keys(receiver))
            Object.defineProperty(receiver, key, { value: undefined });
        }
        return body;
      });
      await response(
        await handlers[action](req, context()),
        200,
        action === 'reconcile'
      );
      for (const getter of getters) expect(getter).toHaveBeenCalledTimes(1);
      expect(f.getUserById.mock.calls[0]).toEqual([actor]);
      for (const callback of [f.getUserById, f.updateUserById]) {
        for (const receiver of callback.mock.contexts)
          expect(receiver).toBe(f.provider);
      }
      for (const key of [
        'inspect',
        'begin',
        'markAttempt',
        'confirm',
        'reconcile',
      ] as const) {
        for (const receiver of callbacks[key].mock.contexts)
          expect(receiver).toBe(f.operations);
      }
    });
    it.each([
      { 'x-tuturuuu-account-action': '' },
      { 'x-tuturuuu-account-action': '01' },
      { 'x-tuturuuu-account-action': '1, 1' },
      { origin: 'null' },
      { origin: 'https://foreign.example.test' },
      { 'sec-fetch-site': 'same-site' },
      { 'sec-fetch-site': 'cross-site' },
      { 'sec-fetch-site': 'none' },
    ])('rejects unsafe headers %j after one authorization', async (patch) => {
      const headers = new Headers({
        'content-type': 'application/json',
        'x-tuturuuu-account-action': '1',
      });
      for (const [key, value] of Object.entries(patch)) headers.set(key, value);
      await response(
        await handlers[action](request(body, headers), context()),
        403
      );
      expect(authorize).toHaveBeenCalledTimes(1);
      noEffects();
    });
    it.each([undefined, 'text/plain', 'application/jsonp'])(
      'rejects media %s',
      async (media) => {
        const headers = new Headers({ 'x-tuturuuu-account-action': '1' });
        if (media) headers.set('content-type', media);
        await response(
          await handlers[action](request(body, headers), context()),
          415
        );
        noEffects();
      }
    );
    it.each([
      null,
      [],
      {},
      { ...body, actorUserId: actor },
      { ...body, targetUserId: id },
      { ...body, recovery: true },
      { ...body, grant: 'root' },
      { ...body, adoption: true },
      { ...body, confirmationEmail: ` ${email}` },
      { ...body, confirmationEmail: email.toUpperCase() },
      { ...body, confirmationEmail: 'outside@example.test' },
      ...[
        -1,
        0.5,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER + 1,
        '0',
        null,
      ].map((expectedRevision) => ({ ...body, expectedRevision })),
    ])('rejects strict body %j before service', async (value) => {
      await response(await handlers[action](request(value), context()), 400);
      noEffects();
    });
    it.each(['invalid', '10000000000040008000000000000001', `${id} `])(
      'rejects path %s',
      async (userId) => {
        await response(await handlers[action](request(), context(userId)), 400);
        noEffects();
      }
    );
    it('distinguishes malformed JSON from unexpected body and params errors', async () => {
      const req = request();
      vi.spyOn(req, 'json').mockRejectedValueOnce(
        new SyntaxError('synthetic private JSON')
      );
      await response(await handlers[action](req, context()), 400);
      const broken = request();
      vi.spyOn(broken, 'json').mockRejectedValueOnce(
        Error('synthetic private body')
      );
      await response(await handlers[action](broken, context()), 503);
      await response(
        await handlers[action](request(), {
          params: throwingParams(),
        }),
        503
      );
      noEffects();
    });
    it.each(definiteCodes)(
      'preserves closed inspect denial %s/%s',
      async (code, status) => {
        f.operations.inspect.mockResolvedValue(denial(code));
        const value = await response(
          await handlers[action](request(), context()),
          status
        );
        expect(value.message).toBe('Employee management could not be verified');
        expect(f.operations.begin).not.toHaveBeenCalled();
        expect(f.updateUserById).not.toHaveBeenCalled();
      }
    );
    it.each([
      ['employee_management_forbidden', 409],
      ['unknown_private_code', 403],
      ['employee_not_found', 418],
    ] as const)(
      'does not trust service code/status %s/%s',
      async (code, status) => {
        f.getUserById.mockRejectedValue(
          new EmployeeManagementError(code, status)
        );
        await response(await handlers[action](request(), context()), 503);
      }
    );
    it('never evaluates arbitrary error fields or diagnostic getters', async () => {
      const error = new EmployeeManagementError(
        'employee_management_forbidden',
        403
      );
      const getter = vi.fn(() => {
        throw Error('synthetic private getter');
      });
      for (const key of ['code', 'status', 'message'])
        Object.defineProperty(error, key, { get: getter });
      // The service contains transport exceptions; its fixed 503 reaches the facade.
      f.getUserById.mockRejectedValue(error);
      await response(await handlers[action](request(), context()), 503);
      expect(getter).not.toHaveBeenCalled();
    });
  });
}
