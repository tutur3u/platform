import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
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
    email?: string | null;
    id: string;
  };
  workspace: WebFinanceWorkspace;
  wsId: string;
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

  const [permissions, currency] = await Promise.all([
    getPermissions({ wsId: workspace.id }),
    getWorkspaceConfig(workspace.id, 'DEFAULT_CURRENCY'),
  ]);

  if (!permissions) {
    return null;
  }

  return {
    currency: currency ?? 'USD',
    permissions,
    user,
    workspace,
    wsId: workspace.id,
  };
}
