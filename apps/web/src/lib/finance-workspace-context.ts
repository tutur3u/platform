import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import {
  getPermissions,
  getWorkspace,
  getWorkspaceConfig,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';

export type WebFinanceWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspace>>
>;

export interface WebFinanceWorkspaceContext {
  currency: string;
  permissions: PermissionsResult;
  user: {
    displayName?: string | null;
    email?: string | null;
    id: string;
  };
  workspace: WebFinanceWorkspace;
  wsId: string;
}

type WebSupabaseClient = Awaited<ReturnType<typeof createClient<Database>>>;

async function resolveFinancePermissionUser(
  supabase: WebSupabaseClient,
  user: NonNullable<
    Awaited<ReturnType<typeof resolveAuthenticatedSessionUser>>['user']
  >
): Promise<WebFinanceWorkspaceContext['user']> {
  const [profileResponse, privateDetailsResponse] = await Promise.all([
    supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('user_private_details')
      .select('full_name, email')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const displayName =
    profileResponse.data?.display_name ??
    privateDetailsResponse.data?.full_name ??
    user.email ??
    user.id;

  return {
    displayName,
    email: privateDetailsResponse.data?.email ?? user.email ?? null,
    id: user.id,
  };
}

export async function getWebFinanceWorkspaceContext(
  id: string
): Promise<WebFinanceWorkspaceContext | null> {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user?.id) {
    return null;
  }

  const workspace = await getWorkspace(id);

  if (!workspace) {
    return null;
  }

  const [permissions, currency, financeUser] = await Promise.all([
    getPermissions({ wsId: workspace.id }),
    getWorkspaceConfig(workspace.id, 'DEFAULT_CURRENCY'),
    resolveFinancePermissionUser(supabase, user),
  ]);

  if (!permissions) {
    return null;
  }

  return {
    currency: currency ?? 'USD',
    permissions,
    user: financeUser,
    workspace,
    wsId: workspace.id,
  };
}
