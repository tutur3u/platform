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
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { calendarPersonalSessionControls } from './calendar-personal-mutation-quota';
import { guardNativeCalendarIntegrity } from './native-integrity/guard';

export async function handleCalendarSettings(
  request: NextRequest,
  wsId?: string
) {
  let finalize = (response: NextResponse) => response;
  try {
    const verifiedUser = getVerifiedMfaBearerUser(request);
    const auth =
      verifiedUser &&
      !request.cookies.has('tuturuuu_app_session') &&
      !request.cookies.has('tuturuuu_web_app_session')
        ? {
            ok: true as const,
            user: verifiedUser,
            supabase: await createClient(request),
          }
        : await resolveSessionAuthContext(request, {
            allowAppSessionAuth: false,
          });
    if (!auth.ok) return auth.response;
    if (wsId === undefined) {
      try {
        const { checkUserSuspension } = await import(
          '@tuturuuu/utils/abuse-protection/user-suspension'
        );
        const suspension = await checkUserSuspension(auth.user.id);
        if (suspension.suspended)
          return NextResponse.json(
            {
              error: 'Forbidden',
              message: suspension.reason ?? 'Account suspended',
            },
            { status: 403 }
          );
      } catch {
        // Preserve the existing personal Calendar endpoint's fail-open policy.
      }
    }
    const quota =
      wsId === undefined
        ? await calendarPersonalSessionControls(request, auth.user)
        : { response: null, headers: {}, finalize };
    finalize = quota.finalize;
    if (quota.response) return finalize(quota.response);
    const integrity = await guardNativeCalendarIntegrity(request, auth.user.id);
    if (integrity) return finalize(integrity);
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
    return finalize(
      NextResponse.json(result, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    );
  } catch (error) {
    const failure = calendarSettingsFailure(error);
    if (failure) {
      return finalize(
        NextResponse.json(
          {
            error: failure.message,
            ...(failure.details ? { details: failure.details } : {}),
          },
          { status: failure.status }
        )
      );
    }
    if (error instanceof SyntaxError)
      return finalize(
        NextResponse.json({ error: 'Invalid request data' }, { status: 400 })
      );
    console.error('Error in calendar settings API:', error);
    return finalize(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    );
  }
}
