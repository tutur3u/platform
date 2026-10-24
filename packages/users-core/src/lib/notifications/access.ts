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
  identityClient: TypedSupabaseClient,
  user: NotificationAuthUser
) {
  let identity = user;

  if (identity.email_confirmed_at === undefined) {
    try {
      const { data, error } = await identityClient.auth.admin.getUserById(
        user.id
      );

      if (error || !data.user) return null;
      identity = data.user;
    } catch {
      return null;
    }
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
    // PostgREST rewrites `*` in LIKE values.
    // Switch to `email.eq` after #6552 stores emails lowercase.
    ...(context.userEmail && !context.userEmail.includes('*')
      ? [
          `and(user_id.is.null,type.eq.workspace_invite,email.ilike.${quotePostgrestString(context.userEmail.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_'))})`,
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
  user: NotificationAuthUser,
  identityClient: TypedSupabaseClient
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

  const userEmail = await getConfirmedEmail(identityClient, user);

  return {
    userId: user.id,
    userEmail,
    workspaceIds:
      memberships
        ?.map((membership) => membership.ws_id)
        .filter((wsId): wsId is string => Boolean(wsId)) ?? [],
  };
}
