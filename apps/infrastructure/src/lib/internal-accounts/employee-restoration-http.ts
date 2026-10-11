import 'server-only';
import { z } from 'zod';
import {
  EmployeeManagementError,
  type ManagementInput,
} from './employee-restoration-boundary';
import {
  ReconcileInputSchema,
  RestoreInputSchema,
  reconcileEmployeeAccess,
  restoreEmployeeAccess,
} from './employee-restoration-orchestration';

export type EmployeeRestorationAuthorization =
  | { authorized: false; status: 401 | 403 | 503 }
  | {
      authorized: true;
      input: Pick<ManagementInput, 'actorUserId' | 'provider' | 'operations'>;
    };
export type EmployeeRestorationAuthorizer = (
  request: Request
) => PromiseLike<EmployeeRestorationAuthorization>;
export type EmployeeRestorationContext = {
  params: PromiseLike<{ userId: string }>;
};

const managementMessage = 'Employee management could not be verified';
const pendingMessage =
  'Employee restoration is pending. Inspect this operation before taking another action.';
const serviceStatuses = new Map<string, number>([
  ['invalid_employee_input', 400],
  ['employee_confirmation_mismatch', 400],
  ['employee_management_forbidden', 403],
  ['employee_not_found', 404],
  ['employee_management_conflict', 409],
  ['employee_provider_tuple_conflict', 409],
  ['employee_self_action', 409],
  ['employee_restoration_not_ready', 409],
  ['employee_revision_or_operation_conflict', 409],
  ['employee_management_unavailable', 503],
  ['employee_provider_unavailable', 503],
  ['employee_administrator_unavailable', 503],
  ['employee_inspection_unavailable', 503],
]);
function reply(status: number, body: object) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}
function denial(status: number) {
  switch (status) {
    case 400:
      return reply(400, {
        code: 'invalid_request',
        message: 'Invalid request',
      });
    case 401:
      return reply(401, { code: 'unauthorized', message: 'Unauthorized' });
    case 403:
      return reply(403, { code: 'forbidden', message: 'Forbidden' });
    case 405:
      return reply(405, {
        code: 'method_not_allowed',
        message: 'Method not allowed',
      });
    case 415:
      return reply(415, {
        code: 'unsupported_media_type',
        message: 'Expected application/json',
      });
    default:
      return reply(503, {
        code: 'employee_management_unavailable',
        message: managementMessage,
      });
  }
}
function serviceFailure(error: unknown) {
  if (error instanceof EmployeeManagementError) {
    // Own data descriptors cannot invoke arbitrary code/status/message getters.
    const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
    const status = Object.getOwnPropertyDescriptor(error, 'status')?.value;
    if (
      typeof code === 'string' &&
      serviceStatuses.has(code) &&
      serviceStatuses.get(code) === status
    ) {
      return reply(status, { code, message: managementMessage });
    }
  }
  return denial(503);
}
function project(
  result: Awaited<ReturnType<typeof reconcileEmployeeAccess>>,
  observed: boolean
) {
  if (result.status === 'restored') {
    return reply(200, {
      status: 'restored',
      account: {
        id: result.account.id,
        email: result.account.email,
        displayName: result.account.displayName,
      },
      operationId: result.operationId,
      revision: result.revision,
    });
  }
  if (
    result.status === 'pending' &&
    result.nextAction === 'inspect' &&
    (result.code === 'employee_restore_outcome_unknown' ||
      result.code === 'employee_restore_confirmation_pending')
  ) {
    return reply(202, {
      status: 'pending',
      code: result.code,
      message: pendingMessage,
      operationId: result.operationId,
      nextAction: 'inspect',
    });
  }
  if (observed && result.status === 'observed') {
    const value = result.observation;
    return reply(200, {
      status: 'observed',
      nextAction: result.nextAction,
      observation: {
        id: value.id,
        email: value.email,
        registryState: value.registryState,
        managedName: value.managedName,
        managementRoleLabel: value.managementRoleLabel,
        revision: value.revision,
        mailboxReady: value.mailboxReady,
        readinessCode: value.readinessCode,
        reservation: value.reservation,
        managed: value.managed,
        providerState: value.providerState,
        operation:
          value.operation === null
            ? null
            : {
                operationId: value.operation.operationId,
                revision: value.operation.revision,
                phase: value.operation.phase,
              },
        recovery:
          value.recovery === null
            ? null
            : {
                email: value.recovery.email,
                verified: value.recovery.verified,
              },
      },
    });
  }
  return denial(503);
}

function snapshotGrant(
  input: Pick<ManagementInput, 'actorUserId' | 'provider' | 'operations'>
) {
  const { actorUserId, provider, operations } = input;
  if (
    typeof actorUserId !== 'string' ||
    actorUserId !== actorUserId.toLowerCase() ||
    !z.uuid().safeParse(actorUserId).success
  )
    return null;
  const { getUserById, updateUserById } = provider;
  const { inspect, begin, markAttempt, confirm, reconcile } = operations;
  if (
    typeof getUserById !== 'function' ||
    typeof updateUserById !== 'function' ||
    typeof inspect !== 'function' ||
    typeof begin !== 'function' ||
    typeof markAttempt !== 'function' ||
    typeof confirm !== 'function' ||
    typeof reconcile !== 'function'
  )
    return null;
  // Snapshot callbacks once while retaining their SDK/semantic method receivers.
  return {
    actorUserId,
    provider: {
      getUserById: getUserById.bind(provider),
      updateUserById: updateUserById.bind(provider),
    },
    operations: {
      inspect: inspect.bind(operations),
      begin: begin.bind(operations),
      markAttempt: markAttempt.bind(operations),
      confirm: confirm.bind(operations),
      reconcile: reconcile.bind(operations),
    },
  };
}

/** Unwired. Root permission must be freshly checked by the required authorizer. */
export function makeEmployeeRestorationHandlers(
  authorize: EmployeeRestorationAuthorizer
) {
  function handler(reconcile: boolean) {
    return async (
      request: Request,
      context: EmployeeRestorationContext
    ): Promise<Response> => {
      try {
        if (request.method !== 'POST') return denial(405);
        const authorization = await authorize(request);
        const authorized = authorization.authorized;
        if (authorized === false) {
          const status = authorization.status;
          return denial(status === 401 || status === 403 ? status : 503);
        }
        if (authorized !== true) return denial(503);
        const grant = snapshotGrant(authorization.input);
        if (!grant) return denial(503);
        if (request.headers.get('x-tuturuuu-account-action') !== '1')
          return denial(403);
        const origin = request.headers.get('origin');
        const site = request.headers.get('sec-fetch-site');
        if (
          (origin !== null && origin !== new URL(request.url).origin) ||
          (site !== null && site !== 'same-origin')
        )
          return denial(403);
        const media = request.headers
          .get('content-type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase();
        if (media !== 'application/json') return denial(415);
        const { userId } = await context.params;
        if (!z.uuid().safeParse(userId).success) return denial(400);
        let body: unknown;
        try {
          body = await request.json();
        } catch (error) {
          return denial(error instanceof SyntaxError ? 400 : 503);
        }
        const parsed = (
          reconcile ? ReconcileInputSchema : RestoreInputSchema
        ).safeParse(body);
        if (
          !parsed.success ||
          parsed.data.expectedRevision === Number.MAX_SAFE_INTEGER ||
          parsed.data.confirmationEmail !==
            parsed.data.confirmationEmail.trim().toLowerCase()
        )
          return denial(400);
        const input = {
          ...parsed.data,
          targetUserId: userId,
          ...grant,
        };
        try {
          return project(
            await (reconcile
              ? reconcileEmployeeAccess(input)
              : restoreEmployeeAccess(input)),
            reconcile
          );
        } catch (error) {
          return serviceFailure(error);
        }
      } catch {
        return denial(503);
      }
    };
  }
  return { restore: handler(false), reconcile: handler(true) };
}
