import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

export type WebHiveWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspace>>
>;

export interface WebHiveAccess {
  isAdmin: boolean;
  isMember: boolean;
  user: {
    email?: string | null;
    id: string;
  };
}

export interface WebHivePageContext {
  access: WebHiveAccess | null;
  user: {
    email?: string | null;
    id: string;
  };
  workspace: WebHiveWorkspace;
  wsId: string;
}

export type WebHiveAccessResolution =
  | {
      error: true;
    }
  | {
      hasAccess: boolean;
      isAdmin: boolean;
      isMember: boolean;
    };

export async function resolveWebHiveAccess({
  userId,
  sbAdmin,
}: {
  userId: string;
  sbAdmin: TypedSupabaseClient;
}): Promise<WebHiveAccessResolution> {
  const [
    { data: member, error: memberError },
    { data: role, error: roleError },
  ] = await Promise.all([
    sbAdmin
      .from('hive_members')
      .select('enabled')
      .eq('user_id', userId)
      .maybeSingle(),
    sbAdmin
      .from('platform_user_roles')
      .select('enabled, allow_role_management')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (memberError || roleError) {
    return { error: true };
  }

  const isAdmin = !!role?.enabled && !!role.allow_role_management;
  const isMember = !!member?.enabled;

  return {
    isAdmin,
    isMember,
    hasAccess: isAdmin || isMember,
  };
}

export async function getWebHivePageContext(
  id: string
): Promise<WebHivePageContext | null> {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user?.id) {
    return null;
  }

  const workspace = await getWorkspace(id);

  if (!workspace) {
    return null;
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const accessResult = await resolveWebHiveAccess({
    userId: user.id,
    sbAdmin,
  });

  if ('error' in accessResult) {
    return null;
  }

  const access = {
    isAdmin: accessResult.isAdmin,
    isMember: accessResult.isMember,
    user,
  };

  return {
    access: accessResult.hasAccess ? access : null,
    user,
    workspace,
    wsId: workspace.id,
  };
}
