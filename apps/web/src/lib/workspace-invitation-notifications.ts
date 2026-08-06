import type { TypedSupabaseClient } from '@tuturuuu/supabase';

export async function finalizeWorkspaceInvitationNotifications({
  action,
  candidateEmails,
  sbAdmin,
  userId,
  workspaceId,
}: {
  action: 'accepted' | 'declined';
  candidateEmails: string[];
  sbAdmin: TypedSupabaseClient;
  userId: string;
  workspaceId: string;
}) {
  const invitationQuery = () =>
    sbAdmin
      .from('notifications')
      .select('id, data')
      .eq('type', 'workspace_invite')
      .eq('entity_type', 'workspace_invite')
      .eq('entity_id', workspaceId);

  const [userNotifications, emailNotifications] = await Promise.all([
    invitationQuery().eq('user_id', userId),
    candidateEmails.length
      ? invitationQuery().in('email', candidateEmails)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (userNotifications.error) throw userNotifications.error;
  if (emailNotifications.error) throw emailNotifications.error;

  const notifications = [
    ...(userNotifications.data ?? []),
    ...(emailNotifications.data ?? []),
  ].filter(
    (notification, index, all) =>
      all.findIndex((candidate) => candidate.id === notification.id) === index
  );

  const actionTimestamp = new Date().toISOString();
  await Promise.all(
    notifications.map(async (notification) => {
      const data =
        notification.data &&
        typeof notification.data === 'object' &&
        !Array.isArray(notification.data)
          ? notification.data
          : {};
      const { error: updateError } = await sbAdmin
        .from('notifications')
        .update({
          data: {
            ...data,
            action_taken: action,
            action_timestamp: actionTimestamp,
          },
        })
        .eq('id', notification.id);

      if (updateError) throw updateError;
    })
  );
}
