import 'server-only';
import {
  EmployeeRejectionRecoverySchema,
  EmployeeRejectionRequestSchema,
} from '@tuturuuu/internal-api/infrastructure/employee-rejection-recovery';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { hasEmployeeRequestOrigin } from '@tuturuuu/utils/internal-accounts/employee-request-origin';
import { z } from 'zod';
import { authorizeEmployeeCreation } from './employee-creation-authorization';
import type { EmployeeCreationAuthorization } from './employee-creation-boundary';
import { adjudicateEmployeeCreationRejection } from './employee-rejection-adjudication';
import { employeeRequestOrigin } from './employee-request-origin';

type Port = {
  inspect(actorUserId: string, operationId: string): Promise<unknown>;
  adjudicate(body: object): Promise<unknown>;
};
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
export function makeEmployeeRejectionBoundary(deps: {
  authorize(request: Request): Promise<EmployeeCreationAuthorization>;
  connect(): Promise<Port>;
}) {
  return async (request: Request, operationId: string) => {
    try {
      const actor = await deps.authorize(request);
      if (!actor.authorized)
        return reply(actor.status, { code: 'employee_rejection_denied' });
      if (!z.uuid().safeParse(operationId).success)
        return reply(400, { code: 'invalid_request' });
      if (!['GET', 'POST'].includes(request.method))
        return reply(405, { code: 'method_not_allowed' });
      let parsed: z.infer<typeof EmployeeRejectionRequestSchema> | null = null;
      if (request.method === 'POST') {
        if (
          request.headers.get('x-tuturuuu-account-action') !== '1' ||
          !hasEmployeeRequestOrigin(request, employeeRequestOrigin(request))
        )
          return reply(403, { code: 'employee_rejection_denied' });
        if (
          request.headers.get('content-type')?.split(';')[0]?.trim() !==
          'application/json'
        )
          return reply(415, { code: 'unsupported_media_type' });
        const body = EmployeeRejectionRequestSchema.safeParse(
          await request.json().catch(() => null)
        );
        if (!body.success) return reply(400, { code: 'invalid_request' });
        parsed = body.data;
        if (
          parsed.adjudication.actorUserId !== actor.actorUserId ||
          parsed.adjudication.operationId !== operationId
        )
          return reply(403, { code: 'employee_rejection_denied' });
      }
      const port = await deps.connect();
      const inspect = async () => {
        const state = EmployeeRejectionRecoverySchema.parse(
          await port.inspect(actor.actorUserId, operationId)
        );
        if (
          state.operationId !== operationId ||
          (state.status !== 'fenced' && state.actorUserId !== actor.actorUserId)
        )
          throw new Error('Recovery identity mismatch');
        return state;
      };
      if (parsed) {
        const current = await inspect();
        const original = parsed.adjudication;
        if (
          current.status !== 'eligible' ||
          current.targetUserId !== original.targetUserId ||
          current.email !== original.email ||
          current.displayName !== original.displayName ||
          current.originalLeaseId !== original.originalLeaseId ||
          current.originalAttemptEventId !== original.originalAttemptEventId
        )
          return reply(409, { code: 'employee_rejection_fenced' });
        await adjudicateEmployeeCreationRejection({
          request: original,
          call: port.adjudicate,
          authorize: async () => {
            const fresh = await deps.authorize(request);
            return fresh.authorized && fresh.actorUserId === actor.actorUserId
              ? { actorUserId: fresh.actorUserId }
              : null;
          },
        });
      }
      const state = await inspect();
      const fresh = await deps.authorize(request);
      if (!fresh.authorized || fresh.actorUserId !== actor.actorUserId)
        return reply(fresh.authorized ? 403 : fresh.status, {
          code: 'employee_rejection_denied',
        });
      if (
        parsed &&
        (state.status !== 'retry_ready' ||
          state.eventId !== parsed.adjudication.eventId ||
          state.evidenceReferenceSha256 !==
            parsed.adjudication.evidenceReferenceSha256)
      )
        return reply(503, { code: 'employee_rejection_unconfirmed' });
      return reply(200, state);
    } catch {
      // An uncertain mutation is never treated as permission to submit CREATE.
      return reply(503, { code: 'employee_rejection_unconfirmed' });
    }
  };
}
export const handleEmployeeRejection = makeEmployeeRejectionBoundary({
  authorize: authorizeEmployeeCreation,
  connect: connectEmployeeRejection,
});

export async function connectEmployeeRejection(): Promise<Port> {
  const { url, key } = checkEnvVariables({ useSecretKey: true });
  const call = async (
    name:
      | 'inspect_employee_creation_rejection'
      | 'adjudicate_employee_creation_rejection',
    body: object
  ) => {
    const response = await fetch(new URL(`/rest/v1/rpc/${name}`, url), {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'private',
        'Accept-Profile': 'private',
        Prefer: 'tx=commit',
      },
      body: JSON.stringify(body),
    });
    if (
      !response.ok ||
      response.headers.get('preference-applied')?.includes('tx=rollback')
    )
      throw new Error('Recovery unavailable');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > 262144)
      throw new Error('Recovery response exceeds bound');
    return JSON.parse(text);
  };
  return {
    inspect: (actorId, operationId) =>
      call('inspect_employee_creation_rejection', {
        p_actor_id: actorId,
        p_operation_id: operationId,
      }),
    adjudicate: (body) => call('adjudicate_employee_creation_rejection', body),
  };
}
