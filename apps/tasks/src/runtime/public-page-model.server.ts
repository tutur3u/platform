import '@tanstack/react-start/server-only';
import {
  hasSupportedSupabaseAuthCookie,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { headers } from '@tuturuuu/start-bridge/next/headers';
import { redirect } from '@tuturuuu/start-bridge/next/navigation';
import { bridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { withAppBase } from '@tuturuuu/start-bridge/start/base-path';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SharedTaskResponse } from '../app/api/v1/shared/tasks/[shareCode]/response';
import { GET as getSharedTask } from '../app/api/v1/shared/tasks/[shareCode]/route';
import { TTR_URL } from '../constants/common';
import { resolveAuthenticatedSessionUser } from '../lib/app-session-user';
import { loadPublicTaskBoard } from '../lib/tasks/public-task-board';

const DEFAULT_TASKS_PATH = '/personal/tasks';

/** The public origin of the current request (the app is served there). */
function requestOrigin() {
  return new URL(bridgeRequest().request.url).origin;
}

/**
 * The login page: an existing satellite session goes to `next`; otherwise to
 * the central login, which returns to `verify-token` inside the basePath.
 */
export async function loginModel(search: URLSearchParams): Promise<never> {
  const origin = requestOrigin();
  const nextPath = normalizeAuthRedirectPath(
    search.get('next') ?? search.get('nextUrl'),
    origin,
    DEFAULT_TASKS_PATH
  );
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('tasks');
  if (
    appSession &&
    (hasWebAppSessionTokenFromRequest({ headers: requestHeaders }) ||
      hasSupportedSupabaseAuthCookie({ headers: requestHeaders })) &&
    search.get('refresh') !== '1'
  )
    redirect(nextPath);
  const returnUrl = new URL(withAppBase('/verify-token'), origin);
  returnUrl.searchParams.set('nextUrl', nextPath);
  const loginUrl = new URL('/login', TTR_URL);
  loginUrl.searchParams.set('returnUrl', returnUrl.toString());
  redirect(loginUrl.toString());
}

export async function publicBoardModel(code: string) {
  const result = await loadPublicTaskBoard(code);
  return result.status === 404
    ? { kind: 'public-board-missing' as const }
    : { kind: 'public-board' as const, payload: result.data };
}

/**
 * A shared task for a signed-in viewer. The share API route is invoked
 * in-process with the viewer's cookies instead of fetching our own origin.
 */
export async function sharedTaskModel(shareCode: string) {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user) redirect(`/login?nextUrl=/shared/task/${shareCode}`);
  const [{ data: profile }, { data: privateDetails }] = await Promise.all([
    supabase
      .from('users')
      .select('id, display_name, avatar_url')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .single(),
  ]);
  const requestHeaders = await headers();
  const response = await getSharedTask(
    new Request(
      new URL(
        `/api/v1/shared/tasks/${encodeURIComponent(shareCode)}`,
        requestOrigin()
      ),
      { headers: { cookie: requestHeaders.get('cookie') ?? '' } }
    ) as Parameters<typeof getSharedTask>[0],
    { params: Promise.resolve({ shareCode }) }
  );
  if (!response.ok) return { kind: 'shared-task-missing' as const };
  let data: SharedTaskResponse;
  try {
    data = (await response.json()) as SharedTaskResponse;
  } catch (error) {
    console.error('Failed to parse shared task data:', error);
    return { kind: 'shared-task-error' as const };
  }
  return {
    kind: 'shared-task' as const,
    response: data,
    shareCode,
    currentUser: {
      id: profile?.id || user.id,
      display_name: profile?.display_name ?? undefined,
      avatar_url: profile?.avatar_url ?? undefined,
      email: privateDetails?.email ?? undefined,
    },
  };
}
