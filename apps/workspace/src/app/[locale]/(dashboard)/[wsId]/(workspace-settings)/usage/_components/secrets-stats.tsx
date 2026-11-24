import StatisticCard from '@/components/cards/StatisticCard';
import { getWorkspaceSecretsAccess } from '@/legacy-api-routes/workspaces/[wsId]/secrets/access';

// The count follows the Secrets page's own access rule (getWorkspaceSecretsAccess):
// workspace secrets are platform-controlled, so only root-workspace secret or
// role managers see it.
export async function SecretsStats({ wsId }: { wsId: string }) {
  const access = await getWorkspaceSecretsAccess(wsId);
  if (!access.allowed) {
    return <StatisticCard title="Secrets" value="***" className="opacity-50" />;
  }

  const { count } = await access.db
    .from('workspace_secrets')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', access.resolvedWsId);

  return <StatisticCard title="Secrets" value={count || 0} />;
}
