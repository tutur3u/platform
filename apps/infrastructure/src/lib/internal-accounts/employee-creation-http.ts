import 'server-only';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { z } from 'zod';
import {
  createEmployeeAccount,
  EmployeeCreationError,
  type EmployeeCreationInput,
} from './employee-creation-orchestration';

export type EmployeeCreationAuthorization =
  | { authorized: false; status: 401 | 403 | 503 }
  | {
      authorized: true;
      input: Pick<
        EmployeeCreationInput,
        'actorUserId' | 'provider' | 'operations'
      >;
    };

export type EmployeeCreationAuthorizer = (
  request: Request
) => PromiseLike<EmployeeCreationAuthorization>;

const BodySchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(320)
      .refine(isExactTuturuuuDotComEmail),
    displayName: z.string().trim().min(1).max(100),
    temporaryPassword: z.string().min(12).max(72),
  })
  .strict();

const unavailableMessage = 'Employee creation is unavailable';
const conflictMessage = 'The account already exists';
const pendingMessage =
  'Account creation is pending. Refresh the directory before retrying; do not submit another creation request.';

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
        code: 'employee_creation_unavailable',
        message: unavailableMessage,
      });
  }
}

function serviceFailure(error: unknown) {
  if (error instanceof EmployeeCreationError) {
    // Inspect own data fields only. Never evaluate arbitrary diagnostic getters.
    const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
    const status = Object.getOwnPropertyDescriptor(error, 'status')?.value;
    if (code === 'employee_account_conflict' && status === 409) {
      return reply(409, { code, message: conflictMessage });
    }
    if (
      code === 'employee_creation_unavailable' &&
      (status === 403 || status === 503)
    ) {
      return reply(status, { code, message: unavailableMessage });
    }
  }
  return denial(503);
}

/** Unwired boundary. The injected authorizer must authenticate and authorize anew. */
export function makeEmployeeCreationHandler(
  authorize: EmployeeCreationAuthorizer
) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST') return denial(405);
      const authorization = await authorize(request);
      if (authorization.authorized === false) {
        const status = authorization.status;
        return denial(status === 401 || status === 403 ? status : 503);
      }
      if (authorization.authorized !== true) return denial(503);

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

      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        return denial(error instanceof SyntaxError ? 400 : 503);
      }
      const parsed = BodySchema.safeParse(body);
      if (!parsed.success) return denial(400);
      let result: Awaited<ReturnType<typeof createEmployeeAccount>>;
      try {
        result = await createEmployeeAccount({
          ...parsed.data,
          actorUserId: authorization.input.actorUserId,
          provider: authorization.input.provider,
          operations: authorization.input.operations,
        });
      } catch (error) {
        return serviceFailure(error);
      }
      if (result.status === 'created') {
        return reply(201, {
          status: 'created',
          account: {
            id: result.account.id,
            email: result.account.email,
            displayName: result.account.displayName,
          },
        });
      }
      if (
        result.status === 'pending' &&
        (result.code === 'account_creation_outcome_unknown' ||
          result.code === 'employee_provisioning_pending')
      ) {
        return reply(202, {
          status: 'pending',
          code: result.code,
          message: pendingMessage,
        });
      }
      return denial(503);
    } catch {
      return denial(503);
    }
  };
}
