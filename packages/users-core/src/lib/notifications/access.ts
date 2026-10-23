import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export interface NotificationAccessContext {
  userId: string;
  userEmail: string | null;
  workspaceIds: string[];
}

interface NotificationAuthUser {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}

function quotePostgrestString(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

async function getConfirmedEmail(
  supabase: TypedSupabaseClient,
  user: NotificationAuthUser
) {
  let identity = user;

  if (identity.email_confirmed_at === undefined) {
    const { data, error } = await supabase.auth.admin.getUserById(user.id);

    if (error) {
      throw new Error(
        `Failed to load confirmed email for notification access: ${error.message}`
      );
    }

    identity = data.user ?? identity;
  }

  return identity.email_confirmed_at
    ? (identity.email?.trim().toLowerCase() ?? null)
    : null;
}

export function buildNotificationAccessFilter(
  context: NotificationAccessContext
) {
  const branches = [
    `and(scope.in.(user,system),user_id.eq.${context.userId})`,
    ...(context.userEmail && context.workspaceIds.length > 0
      ? [
          `and(scope.eq.workspace,user_id.is.null,type.eq.workspace_invite,email.eq.${quotePostgrestString(context.userEmail)},ws_id.in.(${context.workspaceIds.join(',')}))`,
        ]
      : []),
    context.workspaceIds.length > 0
      ? `and(scope.eq.workspace,user_id.eq.${context.userId},or(ws_id.is.null,ws_id.in.(${context.workspaceIds.join(',')})))`
      : `and(scope.eq.workspace,user_id.eq.${context.userId},ws_id.is.null)`,
  ];

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

  const userEmail = await getConfirmedEmail(supabase, user);

  return {
    userId: user.id,
    userEmail,
    workspaceIds:
      memberships
        ?.map((membership) => membership.ws_id)
        .filter((wsId): wsId is string => Boolean(wsId)) ?? [],
  };
}
