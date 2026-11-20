import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import StatisticCard from '@/components/cards/StatisticCard';

export async function ChatUsageStats({ wsId }: { wsId: string }) {
  const supabase = await createClient();
  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  const { containsPermission } = permissions;

  if (!containsPermission('ai_chat')) {
    return (
      <StatisticCard title="Chat Messages" value="***" className="opacity-50" />
    );
  }

  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user?.id) {
    return (
      <StatisticCard title="Chat Messages" value="***" className="opacity-50" />
    );
  }

  // Legacy AI chats have no workspace ID. They appear in the owner's personal workspace.
  const { data: personalWorkspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', permissions.wsId)
    .eq('creator_id', user.id)
    .eq('personal', true)
    .eq('deleted', false)
    .maybeSingle();

  if (!personalWorkspace) {
    return <StatisticCard title="Chat Messages" value={0} />;
  }

  const admin = await createAdminClient({ noCookie: true });
  const { count } = await admin
    .from('ai_chat_messages')
    .select('id, ai_chats!chat_id!inner(creator_id)', {
      count: 'exact',
      head: true,
    })
    .eq('ai_chats.creator_id', user.id);

  return <StatisticCard title="Chat Messages" value={count || 0} />;
}
