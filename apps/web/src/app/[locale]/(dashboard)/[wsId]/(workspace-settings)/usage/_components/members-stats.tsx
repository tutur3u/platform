import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import StatisticCard from '@/components/cards/StatisticCard';

export async function WorkspaceMembersStats({ wsId }: { wsId: string }) {
  const permissions = await getPermissions({ wsId });
  if (!permissions) notFound();
  if (!permissions.containsPermission('manage_workspace_members')) {
    return <StatisticCard title="Members" value="***" className="opacity-50" />;
  }

  const supabase = await createAdminClient();
  const { data: count } = await supabase.rpc('get_workspace_users_count', {
    ws_id: wsId,
  });
  return <StatisticCard title="Members" value={count || 0} />;
}
