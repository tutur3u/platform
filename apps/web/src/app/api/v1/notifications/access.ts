import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export interface NotificationAccessContext {
  userId: string;
  userEmail: string | null;
  workspaceIds: string[];
}

interface NotificationAuthUser {
  id: string;
  email?: string | null;
}

function quotePostgrestString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function buildNotificationAccessFilter(
  context: NotificationAccessContext
): string {
  const branches = [
    `and(scope.in.(user,system),user_id.eq.${context.userId})`,
    context.workspaceIds.length > 0
      ? `and(scope.eq.workspace,user_id.eq.${context.userId},or(ws_id.is.null,ws_id.in.(${context.workspaceIds.join(',')})))`
      : `and(scope.eq.workspace,user_id.eq.${context.userId},ws_id.is.null)`,
  ];

  if (context.userEmail) {
    branches.splice(
      1,
      0,
      `and(scope.in.(user,system),user_id.is.null,email.eq.${quotePostgrestString(context.userEmail)})`
    );
  }

  return branches.join(',');
}

export async function getNotificationAccessContext(
  supabase: TypedSupabaseClient,
  user: NotificationAuthUser
): Promise<NotificationAccessContext> {
  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', user.id);

  if (error) {
    throw new Error(
      `Failed to load workspace memberships for notification access: ${error.message}`
    );
  }

  return {
    userId: user.id,
    userEmail: user.email?.trim().toLowerCase() ?? null,
    workspaceIds:
      memberships
        ?.map((membership) => membership.ws_id)
        .filter((wsId): wsId is string => Boolean(wsId)) ?? [],
  };
}
