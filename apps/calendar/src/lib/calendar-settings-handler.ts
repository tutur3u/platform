import {
  calendarSettingsFailure,
  personalCalendarSettings,
  workspaceCalendarSettings,
} from '@tuturuuu/internal-api/calendar-settings-server';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getVerifiedMfaBearerUser } from '@tuturuuu/utils/required-mfa-runtime';
import { type NextRequest, NextResponse } from 'next/server';
import {
  resolveSessionAuthContext,
  type SessionAuthContext,
} from '@/lib/api-auth';

export async function handleCalendarSettings(
  request: NextRequest,
  wsId?: string,
  authenticatedContext?: SessionAuthContext
) {
  try {
    const verifiedUser = getVerifiedMfaBearerUser(request);
    const auth = authenticatedContext
      ? { ok: true as const, ...authenticatedContext }
      : verifiedUser &&
          !request.cookies.has('tuturuuu_app_session') &&
          !request.cookies.has('tuturuuu_web_app_session')
        ? {
            ok: true as const,
            user: verifiedUser,
            supabase: await createClient(request),
          }
        : await resolveSessionAuthContext(request, {
            allowAppSessionAuth:
              wsId === undefined ? { targetApp: ['calendar', 'tasks'] } : true,
          });
    if (!auth.ok) return auth.response;
    const context = { supabase: auth.supabase, userId: auth.user.id };
    const operation =
      request.method === 'PATCH'
        ? wsId === undefined
          ? { method: 'PATCH' as const, body: await request.json() }
          : { method: 'PATCH' as const, readBody: () => request.json() }
        : { method: 'GET' as const };
    let result:
      | Awaited<ReturnType<typeof personalCalendarSettings>>
      | Awaited<ReturnType<typeof workspaceCalendarSettings>>;
    if (wsId === undefined) {
      result = await personalCalendarSettings(context, operation);
    } else {
      const normalized = wsId.toLowerCase();
      const workspaceId =
        normalized === PERSONAL_WORKSPACE_SLUG
          ? auth.user.id
          : normalized === INTERNAL_WORKSPACE_SLUG
            ? ROOT_WORKSPACE_ID
            : resolveWorkspaceId(wsId);
      result = await workspaceCalendarSettings(context, workspaceId, operation);
    }
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const failure = calendarSettingsFailure(error);
    if (failure) {
      return NextResponse.json(
        {
          error: failure.message,
          ...(failure.details ? { details: failure.details } : {}),
        },
        { status: failure.status }
      );
    }
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    console.error('Error in calendar settings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
