import {
  type FinanceRouteContext,
  getFinanceRouteContext,
} from '@tuturuuu/apis/finance/request-access';
import {
  feeLockNotFoundResponse,
  isFeeLockEnabled,
} from '@tuturuuu/finance-core/fee-lock/access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import { FEE_LOCK_VERSION_CONFLICT_CODE } from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import type { PermissionId } from '@tuturuuu/types';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export type FeeLockRouteAccess =
  | { context: FinanceRouteContext; response?: never }
  | { context?: never; response: NextResponse };

/**
 * Gate for every `/finance/fee-locks` route: session and workspace membership, every listed
 * permission, then the ENABLE_FEE_LOCK flag (404 when off). No admin-client read happens before
 * the permission check. Callers scope by `context.normalizedWsId`, never a body or query value.
 */
export async function getFeeLockRouteContext(
  request: Request,
  rawWsId: string,
  requiredPermissions: PermissionId[]
): Promise<FeeLockRouteAccess> {
  const access = await getFinanceRouteContext(
    request,
    rawWsId,
    await resolveFinanceRouteAuthContext(request)
  );
  if (access.response) return { response: access.response };

  const { context } = access;
  const allowed = requiredPermissions.every((permission) =>
    context.permissions.containsPermission(permission)
  );
  if (!allowed) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  if (!(await isFeeLockEnabled(context.normalizedWsId))) {
    return { response: feeLockNotFoundResponse() };
  }

  return { context };
}

export async function getFeeLockCurrency(wsId: string) {
  return resolveSupportedCurrency(
    await getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
    'VND'
  );
}

type DbError = { code?: string | null; message?: string | null } | null;

/**
 * Maps errors from the private.fee_lock_* functions and fee-lock tables to
 * HTTP. Invalid input (22023), amounts out of range (22003) and violated
 * checks (23514) are client errors (400), never 500. Database messages are
 * not echoed for unexpected errors.
 */
export function feeLockErrorResponse(error: DbError) {
  const code = error?.code ?? '';
  if (code === 'PT404') {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  if (code === '22003' || code === '22023' || code === '23514') {
    const message = error?.message ?? '';
    return NextResponse.json(
      {
        code: /^FEE_LOCK_[A-Z_]+$/.test(message)
          ? message
          : 'FEE_LOCK_INVALID_INPUT',
        message: 'Invalid fee lock',
      },
      { status: 400 }
    );
  }
  console.error('[fee-locks] database error', code);
  return NextResponse.json(
    { message: 'Internal server error' },
    { status: 500 }
  );
}

/** Parses a JSON body with a zod schema; null when the body is not valid JSON or fails the schema. */
export async function parseFeeLockBody<T>(
  request: Request,
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }
): Promise<T | null> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  return parsed.success ? (parsed.data as T) : null;
}

export const invalidFeeLockBody = () =>
  NextResponse.json({ message: 'Invalid request body' }, { status: 400 });

/**
 * Write errors: a stale `expected_version` (PT409) answers 409 with the
 * current header so the UI can show "changed by someone else"; a wrong status
 * (55000) answers 409; the rest goes through feeLockErrorResponse.
 */
export async function feeLockWriteErrorResponse(
  sbAdmin: FinanceRouteContext['sbAdmin'],
  wsId: string,
  error: DbError,
  lookup: { id: string } | { student_id: string; period_month: string }
) {
  if (error?.code === '55000') {
    return NextResponse.json(
      { code: 'FEE_LOCK_WRONG_STATUS', message: 'Wrong fee lock status' },
      { status: 409 }
    );
  }
  if (error?.code !== 'PT409') return feeLockErrorResponse(error);

  let query = sbAdmin.from('fee_locks').select('*').eq('ws_id', wsId);
  query =
    'id' in lookup
      ? query.eq('id', lookup.id)
      : query
          .eq('student_id', lookup.student_id)
          .eq('period_month', lookup.period_month);
  const { data: current } = await query.maybeSingle();
  if (!current) return feeLockErrorResponse({ code: 'PT404' });
  return NextResponse.json(
    {
      code: FEE_LOCK_VERSION_CONFLICT_CODE,
      message: 'This fee lock was changed by someone else',
      current,
    },
    { status: 409 }
  );
}
