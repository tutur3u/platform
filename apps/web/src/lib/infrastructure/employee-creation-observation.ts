import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { authorizeEmployeeCreation } from './employee-creation-authorization';
import type { EmployeeCreationAuthorization } from './employee-creation-boundary';
import { EmployeeOperationSnapshotSchema } from './employee-creation-operation-store';
import {
  createEmployeeRuntimeRpc,
  EmployeeObservedAccountSchema,
} from './employee-creation-rpc';

const ObservationSchema = z
  .object({
    operation: EmployeeOperationSnapshotSchema.nullable(),
    account: EmployeeObservedAccountSchema.nullable(),
  })
  .strict();
const ActiveIdentitySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  email_confirmed_at: z.string(),
  banned_until: z.string().nullable().optional(),
  app_metadata: z.object({ employee_onboarding: z.literal(true) }),
});
// This port deliberately exposes no claim, advance, finalize, confirm or auth writes.
type ObservationPort = {
  inspect(actorId: string, operationId: string): Promise<unknown>;
  identity(targetId: string): Promise<unknown>;
};
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
export function makeEmployeeCreationObservation(deps: {
  authorize(request: Request): Promise<EmployeeCreationAuthorization>;
  connect(): Promise<ObservationPort>;
  now?: () => number;
}) {
  return async (request: Request, operationId: string) => {
    const pending = () =>
      reply(202, {
        status: 'pending',
        operationId,
        code: 'account_creation_outcome_unknown',
        nextAction: 'inspect',
      });
    try {
      const actor = await deps.authorize(request);
      if (!actor.authorized)
        return reply(actor.status, { code: 'employee_observation_denied' });
      if (!z.uuid().safeParse(operationId).success)
        return reply(400, { code: 'invalid_request' });
      const port = await deps.connect();
      const first = ObservationSchema.parse(
        await port.inspect(actor.actorUserId, operationId)
      );
      const operation = first.operation;
      if (
        operation &&
        (operation.actorUserId !== actor.actorUserId ||
          operation.operationId !== operationId)
      )
        throw new Error('Operation identity mismatch');
      const provider =
        operation && !operation.revoked && operation.phase !== 'unknown'
          ? ActiveIdentitySchema.safeParse(
              await port.identity(operation.targetUserId)
            )
          : null;
      // SQL account/profile/mailbox/grant proof must be fresh after the independent provider read.
      const fresh = operation
        ? ObservationSchema.parse(
            await port.inspect(actor.actorUserId, operationId)
          )
        : first;
      const authorized = await deps.authorize(request);
      if (!authorized.authorized)
        return reply(authorized.status, {
          code: 'employee_observation_denied',
        });
      if (authorized.actorUserId !== actor.actorUserId)
        return reply(403, { code: 'employee_observation_denied' });
      if (!operation) return pending();
      const current = fresh.operation;
      if (
        !current ||
        current.actorUserId !== actor.actorUserId ||
        current.operationId !== operationId ||
        current.targetUserId !== operation.targetUserId ||
        current.email !== operation.email ||
        current.displayName !== operation.displayName
      )
        throw new Error('Operation changed');
      if (current.revoked || current.phase === 'unknown')
        return reply(200, {
          status: 'stopped',
          operationId,
          code: current.revoked
            ? 'employee_operation_revoked'
            : 'employee_operation_halted',
        });
      const account = fresh.account;
      const identity = provider?.success ? provider.data : null;
      const now = (deps.now ?? Date.now)();
      const ban = identity?.banned_until
        ? Date.parse(identity.banned_until)
        : 0;
      if (
        !identity ||
        identity.id !== current.targetUserId ||
        identity.email !== current.email ||
        !Number.isFinite(Date.parse(identity.email_confirmed_at)) ||
        !Number.isFinite(ban) ||
        ban > now ||
        !account ||
        account.status !== 'created' ||
        account.id !== current.targetUserId ||
        account.email !== current.email ||
        (account.creationDisplayName === undefined
          ? account.displayName !== current.displayName
          : current.phase !== 'active' ||
            account.creationDisplayName !== current.displayName ||
            account.displayName === current.displayName)
      )
        return pending();
      return reply(200, {
        status: 'created',
        operationId,
        account: {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          ...(account.creationDisplayName === undefined
            ? {}
            : { creationDisplayName: account.creationDisplayName }),
        },
      });
    } catch {
      return reply(503, { code: 'employee_observation_unavailable' });
    }
  };
}
export const observeEmployeeCreation = makeEmployeeCreationObservation({
  authorize: authorizeEmployeeCreation,
  async connect() {
    const transport = createEmployeeRuntimeRpc(
      checkEnvVariables({ useSecretKey: true })
    );
    const admin = await createAdminClient({ noCookie: true });
    return {
      async inspect(actorId, operationId) {
        await transport.ready(actorId);
        return transport.inspect(actorId, operationId);
      },
      async identity(targetId) {
        const result = await admin.auth.admin.getUserById(targetId);
        if (result.error) throw new Error('Provider observation unavailable');
        return result.data.user;
      },
    };
  },
});
