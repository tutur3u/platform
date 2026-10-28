import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  EmployeeProviderUser,
  EmployeeRestorationProvider,
  Inspection,
} from '@tuturuuu/utils/internal-accounts/employee-restoration-boundary';
import { vi } from 'vitest';

export const actor = '10000000-0000-4000-8000-000000000001';
export const target = '10000000-0000-4000-8000-000000000002';
export const operationId = '10000000-0000-4000-8000-000000000003';
export const email = 'fixture@tuturuuu.com';
export const tuple = {
  actorUserId: actor,
  targetUserId: target,
  email,
  expectedRevision: 0,
  operationId,
};
export const inspection: Inspection = {
  id: target,
  email,
  registryState: 'active',
  managedName: 'Fixture',
  managementRoleLabel: null,
  revision: 0,
  mailboxReady: true,
  readinessCode: 'ready',
  reservation: 'exact_intent',
  managed: true,
  operation: null,
  recovery: null,
};
const active: EmployeeProviderUser = {
  id: target,
  email,
  aud: 'authenticated',
  created_at: '2026-01-01',
  identities: [
    {
      id: 'fixture-identity',
      identity_id: 'fixture-identity',
      user_id: target,
      provider: 'email',
      identity_data: {},
    },
  ],
  email_confirmed_at: '2026-01-01',
  app_metadata: { employee_onboarding: true },
  user_metadata: {},
};

/** Disposable HTTP fixture only. This does not run PostgreSQL or GoTrue. */
export async function restorationFixture() {
  const events: string[] = [];
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let observation = structuredClone(inspection);
  let banned = true;
  let authorized = true;
  let enabled = true;
  let mutation = '';
  let replyMode = 'normal';
  let modeAt = '';
  let afterReadback: (() => void) | null = null;
  let revokeAt = '';
  let failAt = '';
  const provider: EmployeeRestorationProvider = {
    getUserById: vi.fn(async (id) => {
      events.push(id === actor ? 'provider:actor' : 'provider:read');
      return {
        data: {
          user: {
            ...active,
            id,
            banned_until: id !== actor && banned ? '2126-01-01' : undefined,
          },
        },
        error: null,
      };
    }),
    updateUserById: vi.fn(async () => {
      events.push('provider:update');
      banned = false;
      if (revokeAt === 'provider:update') authorized = false;
      if (failAt === 'provider:update')
        throw new Error('lost provider acknowledgement');
      return { data: { user: active }, error: null };
    }),
  };
  const server = createServer(async (req, res) => {
    try {
      let text = '';
      for await (const chunk of req) text += String(chunk);
      const body = JSON.parse(text);
      const name = req.url?.split('/').at(-1) ?? '';
      events.push(name);
      calls.push({ name, body });
      const inspecting = name === 'inspect_employee_management';
      const mode =
        !modeAt || name === modeAt || (inspecting && mutation === modeAt)
          ? replyMode
          : 'normal';
      if (name === failAt) {
        req.socket.destroy();
        return;
      }
      if (
        revokeAt &&
        (name === revokeAt || (inspecting && mutation === revokeAt))
      )
        authorized = false;
      let result: unknown;
      if (inspecting) {
        result = observation;
        if (mode === 'missing-readback' && mutation)
          result = { ...observation, operation: null };
        if (mode === 'stale-readback' && mutation)
          result = { ...observation, revision: 99 };
      } else {
        mutation = name;
        const phase =
          name === 'begin_employee_restore'
            ? 'reserved'
            : name === 'mark_employee_restore_attempt'
              ? 'attempted'
              : 'completed';
        result =
          phase === 'completed'
            ? {
                id: target,
                email,
                displayName: 'Fixture',
                operationId: body.p_operation_id,
                revision: 1,
                status: 'restored',
              }
            : { operationId: body.p_operation_id, revision: 0, phase };
        if (mode !== 'unpersisted' && mode !== 'rollback')
          observation = {
            ...observation,
            revision: phase === 'completed' ? 1 : 0,
            operation: {
              operationId: String(body.p_operation_id),
              revision: 0,
              phase,
            },
          };
        if (mode === 'rollback')
          res.setHeader('Preference-Applied', 'tx=rollback');
        if (mode === 'wrong-operation')
          result = { operationId: actor, revision: 0, phase };
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      if (inspecting && mutation === 'mark_employee_restore_attempt')
        afterReadback?.();
    } catch {
      res.statusCode = 500;
      res.end('{}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw Error('missing loopback address');
  const url = `http://127.0.0.1:${(address satisfies AddressInfo).port}`;
  const authorize = vi.fn(async () =>
    authorized
      ? { authorized: true as const, actorUserId: actor }
      : { authorized: false as const, status: 403 as const }
  );
  return {
    events,
    calls,
    provider,
    authorize,
    deps: {
      authorize,
      configuration: () => ({ url, key: 'synthetic' }),
      provider: async () => provider,
      enabled: () => enabled,
    },
    transport: {
      url,
      key: 'synthetic',
      actorUserId: actor,
      targetUserId: target,
      authorize: async () => authorized,
    },
    setMode(value: string, at = '') {
      replyMode = value;
      modeAt = at;
    },
    afterAttemptReadback(callback: () => void) {
      afterReadback = callback;
    },
    setRevokeAt(value: string) {
      revokeAt = value;
    },
    setFailAt(value: string) {
      failAt = value;
    },
    setAuthorized(value: boolean) {
      authorized = value;
    },
    setEnabled(value: boolean) {
      enabled = value;
    },
    setBanned(value: boolean) {
      banned = value;
    },
    setObservation(value: Inspection) {
      observation = value;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
export function request(
  body: object = { confirmationEmail: email, expectedRevision: 0 }
) {
  return new Request('https://web.test/api/restore', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tuturuuu-account-action': '1',
    },
    body: JSON.stringify(body),
  });
}
export const context = () => ({ params: Promise.resolve({ userId: target }) });
