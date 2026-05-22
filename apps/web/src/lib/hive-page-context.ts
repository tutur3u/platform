import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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

  const admin = await createAdminClient({ noCookie: true });
  const [
    { data: member, error: memberError },
    { data: role, error: roleError },
  ] = await Promise.all([
    admin
      .from('hive_members')
      .select('enabled')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('platform_user_roles')
      .select('enabled, allow_role_management')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (memberError || roleError) {
    return null;
  }

  const access = {
    isAdmin: !!role?.enabled && !!role.allow_role_management,
    isMember: !!member?.enabled,
    user,
  };

  return {
    access: access.isAdmin || access.isMember ? access : null,
    user,
    workspace,
    wsId: workspace.id,
  };
}
