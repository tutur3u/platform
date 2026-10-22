import {
  type CreateInternalEmployeePayload,
  EmployeeCreationNonAdmissionSchema,
  EmployeeCreationOperationSchema,
  EmployeeCreationPayloadSchema,
  EmployeeCreationReplySchema,
} from '@tuturuuu/internal-api/infrastructure';
import { hasEmployeeRequestOrigin } from '@tuturuuu/utils/internal-accounts/employee-request-origin';
import { z } from 'zod';
import { employeeRequestOrigin } from './employee-request-origin';

export type EmployeeCreationAuthorization =
  | { authorized: false; status: 401 | 403 | 503 }
  | { authorized: true; actorUserId: string };

/** Persistent dependency, not a memory journal or a per-invocation UUID wrapper.
 * Claim binds actor+operation+canonical identity payload and preserves one target UUID.
 * The result envelope binds targetUserId to its strictly validated outcome.
 * Password is transient execution input; never persist it or a password-derived verifier.
 * Re-entry inspects known pending/unknown outcomes; it must not repeat provider creation.
 * Only a separately qualified journal+SQL+provider supplier may implement this port.
 */
export type EmployeeCreationJournal = {
  available(actorUserId: string): Promise<boolean>;
  claimAndRun(input: {
    actorUserId: string;
    operationId: string;
    payload: CreateInternalEmployeePayload;
  }): Promise<unknown>;
};
const JournalResultSchema = z
  .object({
    targetUserId: z.uuid(),
    outcome: EmployeeCreationReplySchema,
  })
  .strict();

type Dependencies = {
  authorize(request: Request): Promise<EmployeeCreationAuthorization>;
  journal?: EmployeeCreationJournal;
};
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
const unavailable = () => reply(503, { code: 'employee_creation_unavailable' });
const pending = (operationId: string) =>
  reply(202, {
    status: 'pending',
    operationId,
    code: 'account_creation_outcome_unknown',
    nextAction: 'inspect',
  });

export function makeEmployeeCreationBoundary({
  authorize,
  journal,
}: Dependencies) {
  return async (request: Request) => {
    let actor: EmployeeCreationAuthorization;
    try {
      actor = await authorize(request);
    } catch {
      return unavailable();
    }
    if (!actor.authorized)
      return reply(actor.status, {
        code:
          actor.status === 401
            ? 'unauthorized'
            : actor.status === 403
              ? 'forbidden'
              : 'employee_creation_unavailable',
      });
    if (request.method === 'GET') {
      try {
        return reply(200, {
          available: journal
            ? await journal.available(actor.actorUserId)
            : false,
        });
      } catch {
        return reply(200, { available: false });
      }
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'method_not_allowed' });
    if (
      request.headers.get('x-tuturuuu-account-action') !== '1' ||
      !hasEmployeeRequestOrigin(request, employeeRequestOrigin(request))
    )
      return reply(403, { code: 'forbidden' });
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      return reply(415, { code: 'unsupported_media_type' });
    const operation = EmployeeCreationOperationSchema.safeParse(
      request.headers.get('idempotency-key')
    );
    if (!operation.success) return reply(400, { code: 'invalid_request' });
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return reply(400, { code: 'invalid_request' });
    }
    const parsed = EmployeeCreationPayloadSchema.safeParse(input);
    if (!parsed.success) return reply(400, { code: 'invalid_request' });
    if (!journal) return unavailable();
    try {
      if (!(await journal.available(actor.actorUserId))) return unavailable();
    } catch {
      return unavailable();
    }
    // Claim invocation can be uncertain; only a bound preclaim result proves nonadmission.
    try {
      const raw = await journal.claimAndRun({
        actorUserId: actor.actorUserId,
        operationId: operation.data,
        payload: parsed.data,
      });
      const proof = EmployeeCreationNonAdmissionSchema.safeParse(raw);
      if (
        proof.success &&
        proof.data.actorUserId === actor.actorUserId &&
        proof.data.operationId === operation.data &&
        proof.data.email === parsed.data.email &&
        proof.data.displayName === parsed.data.displayName
      )
        return reply(
          proof.data.reason === 'invalid_input' ? 400 : 503,
          proof.data
        );
      const value = JournalResultSchema.safeParse(raw);
      if (!value.success || value.data.outcome.operationId !== operation.data)
        return pending(operation.data);
      const result = value.data.outcome;
      if (
        result.status === 'created' &&
        (result.account.id !== value.data.targetUserId ||
          result.account.email !== parsed.data.email ||
          result.account.displayName !== parsed.data.displayName)
      )
        return pending(operation.data);
      return reply(
        result.status === 'created'
          ? 201
          : result.status === 'conflict'
            ? 409
            : 202,
        result
      );
    } catch {
      return pending(operation.data);
    }
  };
}
