import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

export type WebMindWorkspace = NonNullable<
  Awaited<ReturnType<typeof getWorkspace>>
>;

export interface WebMindWorkspaceContext {
  user: {
    email?: string | null;
    id: string;
  };
  workspace: WebMindWorkspace;
  wsId: string;
}

export async function getWebMindWorkspaceContext(
  id: string
): Promise<WebMindWorkspaceContext | null> {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user?.id) {
    return null;
  }

  const workspace = await getWorkspace(id);

  if (!workspace) {
    return null;
  }

  return {
    user,
    workspace,
    wsId: workspace.id,
  };
}
