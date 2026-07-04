import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveUserGroupRouteWorkspaceId } from '@/lib/user-groups/route-helpers';
import {
  previewDetachedUserGroupSessionReconciliation,
  reconcileDetachedUserGroupSession,
} from '@/lib/user-groups/session-schedule';

interface Params {
  params: Promise<{
    sessionId: string;
    wsId: string;
  }>;
}

type ReconcileMode = 'convert_weekly' | 'exact' | 'snap' | 'weekly';

async function authorizeScheduleUpdate(
  req: Request,
  wsId: string
): Promise<{ normalizedWsId: string } | { response: NextResponse }> {
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);
  const permissions = await getPermissions({ request: req, wsId });

  if (!permissions) {
    return {
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  if (permissions.withoutPermission('update_user_groups')) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions to update user group sessions' },
        { status: 403 }
      ),
    };
  }

  return { normalizedWsId };
}

async function parseReconcilePayload(req: Request): Promise<
  | {
      mode?: ReconcileMode;
    }
  | NextResponse
> {
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return {};
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid reconcile payload' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') return {};

  const mode = (body as { mode?: unknown }).mode;
  if (mode === undefined || mode === null) return {};
  if (
    mode !== 'convert_weekly' &&
    mode !== 'exact' &&
    mode !== 'snap' &&
    mode !== 'weekly'
  ) {
    return NextResponse.json(
      { message: 'Invalid reconcile mode' },
      { status: 400 }
    );
  }

  return { mode };
}

function recurringReconciliationErrorResponse(error: unknown) {
  if (
    error instanceof Error &&
    error.message === 'ambiguous_series_reconciliation'
  ) {
    return NextResponse.json(
      { message: 'Multiple matching recurring schedules found' },
      { status: 409 }
    );
  }

  if (
    error instanceof Error &&
    error.message === 'series_occurrence_already_exists'
  ) {
    return NextResponse.json(
      { message: 'A recurring session already exists for this date' },
      { status: 409 }
    );
  }

  return null;
}

export async function GET(req: Request, { params }: Params) {
  const { sessionId, wsId } = await params;
  const authorization = await authorizeScheduleUpdate(req, wsId);
  if ('response' in authorization) return authorization.response;

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const data = await previewDetachedUserGroupSessionReconciliation({
      sessionId,
      supabase,
      wsId: authorization.normalizedWsId,
    });

    if (!data) {
      return NextResponse.json(
        { message: 'No matching recurring schedule found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, message: 'success' });
  } catch (error) {
    const knownErrorResponse = recurringReconciliationErrorResponse(error);
    if (knownErrorResponse) return knownErrorResponse;

    console.error('Failed to preview user group session recurrence', {
      error,
    });
    return NextResponse.json(
      { message: 'Failed to preview user group session recurrence' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request, { params }: Params) {
  const { sessionId, wsId } = await params;
  const authorization = await authorizeScheduleUpdate(req, wsId);
  if ('response' in authorization) return authorization.response;
  const payload = await parseReconcilePayload(req);
  if (payload instanceof NextResponse) return payload;

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const data = await reconcileDetachedUserGroupSession({
      payload,
      sessionId,
      supabase,
      wsId: authorization.normalizedWsId,
    });

    if (!data) {
      return NextResponse.json(
        { message: 'No matching recurring schedule found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ data, message: 'success' });
  } catch (error) {
    const knownErrorResponse = recurringReconciliationErrorResponse(error);
    if (knownErrorResponse) return knownErrorResponse;

    console.error('Failed to reconcile user group session recurrence', {
      error,
    });
    return NextResponse.json(
      { message: 'Failed to reconcile user group session recurrence' },
      { status: 500 }
    );
  }
}
