import 'server-only';
import { EmployeeCliRecoveryRequestSchema } from '@tuturuuu/internal-api/infrastructure/employee-cli-recovery';
import { EmployeeCreationReplySchema } from '@tuturuuu/internal-api/infrastructure/employee-creation';
import { EmployeeRejectionRecoverySchema } from '@tuturuuu/internal-api/infrastructure/employee-rejection-recovery';
import { hasEmployeeRequestOrigin } from '@tuturuuu/utils/internal-accounts/employee-request-origin';
import { z } from 'zod';
import {
  type EmployeeCreationAuthorization,
  type EmployeeCreationJournal,
  makeEmployeeCreationBoundary,
} from './employee-creation-boundary';
import { makeEmployeeRejectionBoundary } from './employee-rejection-boundary';
import { employeeRequestOrigin } from './employee-request-origin';

type Dependencies = {
  authorize(request: Request): Promise<EmployeeCreationAuthorization>;
  connect: Parameters<typeof makeEmployeeRejectionBoundary>[0]['connect'];
  journal(request: Request): Promise<EmployeeCreationJournal | undefined>;
};
const reply = (status: number, code: string, nextAction?: 'inspect') =>
  Response.json(
    { code, ...(nextAction ? { nextAction } : {}) },
    {
      status,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    }
  );

export function makeEmployeeCliRecoveryBoundary(deps: Dependencies) {
  return async (request: Request, operationId: string) => {
    try {
      const actor = await deps.authorize(request);
      if (!actor.authorized)
        return reply(actor.status, 'employee_recovery_denied');
      if (!['GET', 'POST'].includes(request.method))
        return reply(405, 'method_not_allowed');
      if (
        !z.uuid().safeParse(operationId).success ||
        request.headers.get('idempotency-key') !== operationId
      )
        return reply(400, 'invalid_request');
      if (!hasEmployeeRequestOrigin(request, employeeRequestOrigin(request)))
        return reply(403, 'employee_recovery_denied');
      const port = await deps.connect();
      const state = EmployeeRejectionRecoverySchema.parse(
        await port.inspect(actor.actorUserId, operationId)
      );
      if (
        state.status === 'fenced' ||
        state.operationId !== operationId ||
        state.actorUserId !== actor.actorUserId
      )
        return reply(409, 'employee_recovery_fenced');
      const fresh = await deps.authorize(request);
      if (!fresh.authorized || fresh.actorUserId !== actor.actorUserId)
        return reply(
          fresh.authorized ? 403 : fresh.status,
          'employee_recovery_denied'
        );
      if (request.method === 'GET')
        return Response.json(state, {
          headers: { 'Cache-Control': 'private, no-store, max-age=0' },
        });
      if (request.headers.get('x-tuturuuu-account-action') !== '1')
        return reply(403, 'employee_recovery_denied');
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim() !==
        'application/json'
      )
        return reply(415, 'unsupported_media_type');
      const parsed = EmployeeCliRecoveryRequestSchema.safeParse(
        await request.json().catch(() => null)
      );
      if (!parsed.success) return reply(400, 'invalid_request');
      const body = parsed.data;
      const expected =
        body.action === 'resume' ? body.expected : body.adjudication;
      for (const key of [
        'actorUserId',
        'operationId',
        'targetUserId',
        'email',
        'displayName',
        'originalLeaseId',
        'originalAttemptEventId',
        'expectedVersion',
      ] as const)
        if (state[key] !== expected[key])
          return reply(409, 'employee_recovery_fenced');
      if (body.action === 'adjudicate') {
        if (state.status !== 'eligible')
          return reply(409, 'employee_recovery_fenced');
        return makeEmployeeRejectionBoundary({
          authorize: deps.authorize,
          connect: async () => port,
        })(
          new Request(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({
              workspaceId: '00000000-0000-0000-0000-000000000000',
              adjudication: body.adjudication,
            }),
          }),
          operationId
        );
      }
      if (
        state.status !== 'retry_ready' ||
        state.expectedVersion !== 3 ||
        state.eventId !== body.expected.eventId ||
        state.evidenceReferenceSha256 !== body.expected.evidenceReferenceSha256
      )
        return reply(409, 'employee_recovery_fenced');
      const journal = await deps.journal(request);
      if (!journal) return reply(503, 'employee_recovery_unavailable');
      const response = await makeEmployeeCreationBoundary({
        authorize: deps.authorize,
        journal: {
          available: (actorId) => journal.available(actorId),
          async claimAndRun(input) {
            if (
              input.actorUserId !== state.actorUserId ||
              input.operationId !== state.operationId ||
              input.payload.email !== state.email ||
              input.payload.displayName !== state.displayName
            )
              throw new Error('Recovery claim identity changed');
            // Re-read immediately before the existing durable claim; never create a missing operation.
            const current = EmployeeRejectionRecoverySchema.parse(
              await port.inspect(actor.actorUserId, operationId)
            );
            if (
              current.status !== 'retry_ready' ||
              Object.entries(body.expected).some(
                ([key, value]) => Reflect.get(current, key) !== value
              )
            )
              throw new Error('Recovery admission changed');
            const authorized = await deps.authorize(request);
            if (
              !authorized.authorized ||
              authorized.actorUserId !== actor.actorUserId
            )
              throw new Error('Recovery actor changed');
            const result = z
              .strictObject({
                targetUserId: z.uuid(),
                outcome: EmployeeCreationReplySchema,
              })
              .parse(await journal.claimAndRun(input));
            if (
              result.targetUserId !== state.targetUserId ||
              (result.outcome.status === 'created' &&
                result.outcome.account.id !== state.targetUserId)
            )
              throw new Error('Recovery target changed');
            return result;
          },
        },
      })(
        new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify({
            email: state.email,
            displayName: state.displayName,
            temporaryPassword: body.temporaryPassword,
          }),
        })
      );
      const finalActor = await deps.authorize(request);
      if (
        !finalActor.authorized ||
        finalActor.actorUserId !== actor.actorUserId
      )
        return reply(
          finalActor.authorized ? 403 : finalActor.status,
          'employee_recovery_unconfirmed',
          'inspect'
        );
      return response;
    } catch {
      return reply(503, 'employee_recovery_unconfirmed', 'inspect');
    }
  };
}
