import { Workspace } from '@/types/primitives/Workspace';
import WorkspaceInviteSnippet from '../../../../components/notifications/WorkspaceInviteSnippet';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Database } from '@/types/supabase';

export default async function NotificationsPage() {
  const { t } = useTranslation('notifications');
  const invites = await getWorkspaceInvites();

  const noNotifications = t('no-notifications');
  const desc = t('no-notifications-desc');

  return (
    <div className="min-h-full">
      {(invites?.length || 0) > 0 ? (
        <div className="mb-16 grid gap-4 xl:grid-cols-2">
          {invites?.map((ws) => (
            <WorkspaceInviteSnippet key={ws.id} ws={ws} transparent={false} />
          ))}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <CheckBadgeIcon className="h-32 w-32 text-green-500" />
          <h3 className="text-2xl font-semibold text-zinc-700 dark:text-zinc-300">
            {noNotifications}
          </h3>
          <p className="text-zinc-700 dark:text-zinc-400">{desc}</p>
        </div>
      )}
    </div>
  );
}

async function getWorkspaceInvites() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspace_invites')
    .select('created_at, workspaces(id, name)')
    .eq('user_id', user.id);

  if (!data || error) throw error;

  const workspaces: Workspace[] = data.map(({ workspaces, created_at }) => ({
    id: workspaces?.id ?? '',
    name: workspaces?.name ?? '',
    created_at,
  }));

  return workspaces;
}
