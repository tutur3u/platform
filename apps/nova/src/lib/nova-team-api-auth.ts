import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { type NextRequest, NextResponse } from 'next/server';
import {
  getNovaAppSessionUserFromRequest,
  getNovaPlatformRole,
  type NovaPlatformRole,
} from '@/lib/app-session';

type NovaApiUser = {
  email?: string | null;
  id: string;
};

function createPrivateDb(sbAdmin: TypedSupabaseClient) {
  return sbAdmin.schema('private');
}

type PrivateDb = ReturnType<typeof createPrivateDb>;

type NovaTeamApiContext = {
  privateDb: PrivateDb;
  role: NovaPlatformRole | null;
  sbAdmin: TypedSupabaseClient;
  user: NovaApiUser;
};

function deny(message: string, status: number) {
  return {
    ok: false as const,
    response: NextResponse.json({ error: message }, { status }),
  };
}

async function loadNovaTeamApiContext(request: NextRequest | Request): Promise<
  | {
      ok: true;
      value: NovaTeamApiContext;
    }
  | ReturnType<typeof deny>
> {
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return deny('Unauthorized', 401);
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const role = await getNovaPlatformRole(user.id, sbAdmin);

  return {
    ok: true,
    value: {
      privateDb: createPrivateDb(sbAdmin),
      role,
      sbAdmin,
      user: {
        email: user.email,
        id: user.id,
      },
    },
  };
}

function hasEnabledRoleManagement(role: NovaPlatformRole | null) {
  return Boolean(role?.enabled && role.allow_role_management);
}

export async function authorizeNovaEnabledUser(request: NextRequest | Request) {
  const context = await loadNovaTeamApiContext(request);
  if (!context.ok) return context;

  if (!context.value.role?.enabled) {
    return deny('Forbidden', 403);
  }

  return context;
}

export async function authorizeNovaRoleManager(request: NextRequest | Request) {
  const context = await loadNovaTeamApiContext(request);
  if (!context.ok) return context;

  if (!hasEnabledRoleManagement(context.value.role)) {
    return deny('Forbidden', 403);
  }

  return context;
}

export async function authorizeNovaTeamProfileEditor(
  request: NextRequest | Request,
  teamId: string
) {
  const context = await loadNovaTeamApiContext(request);
  if (!context.ok) return context;

  if (hasEnabledRoleManagement(context.value.role)) {
    return context;
  }

  if (!context.value.role?.enabled) {
    return deny('Forbidden', 403);
  }

  const { data, error } = await context.value.privateDb
    .from('nova_team_members')
    .select('team_id')
    .eq('team_id', teamId)
    .eq('user_id', context.value.user.id)
    .maybeSingle();

  if (error) {
    return deny('Failed to authorize team access', 500);
  }

  if (!data) {
    return deny('Forbidden', 403);
  }

  return context;
}
