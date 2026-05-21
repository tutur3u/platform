import {
  handleTaskDetailRouteDELETE,
  handleTaskDetailRouteGET,
  handleTaskDetailRoutePATCH,
  handleTaskDetailRoutePUT,
} from '@tuturuuu/apis/tu-do/tasks/taskId/route';
import {
  attachSupabaseAuthUser,
  getAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';

type Params = { wsId: string; taskId: string };
type RouteContext = { params: Promise<Params> };

function createCliSessionUser(claims: { email: string | null; sub: string }) {
  return {
    aud: 'authenticated',
    email: claims.email ?? undefined,
    id: claims.sub,
  } as SupabaseUser;
}

async function resolveCliTaskDetailAuth(request: Request) {
  const appSessionToken = getAppSessionTokenFromRequest(request);

  if (!appSessionToken) {
    return undefined;
  }

  const verification = verifyCliAccessToken(appSessionToken);

  if (!verification.ok) {
    return undefined;
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const user = createCliSessionUser(verification.claims);

  return {
    appSession: true,
    supabase: attachSupabaseAuthUser(sbAdmin, user),
    user,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handleTaskDetailRouteGET(
    request,
    context,
    await resolveCliTaskDetailAuth(request)
  );
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handleTaskDetailRoutePUT(
    request,
    context,
    await resolveCliTaskDetailAuth(request)
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handleTaskDetailRouteDELETE(
    request,
    context,
    await resolveCliTaskDetailAuth(request)
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handleTaskDetailRoutePATCH(
    request,
    context,
    await resolveCliTaskDetailAuth(request)
  );
}
