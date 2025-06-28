import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Separator } from '@tuturuuu/ui/separator';
import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import WorkspaceCard from '../../../../../../../components/cards/WorkspaceCard';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InfrastructureWorkspacesPage({ params }: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  const workspaces = await getWorkspaces();

  return (
    <div className="flex min-h-full w-full flex-col">
      <Separator className="mt-4" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {workspaces.map((ws) => (
          <WorkspaceCard key={ws.id} ws={ws} />
        ))}
      </div>
    </div>
  );
}

async function getWorkspaces() {
  const supabaseAdmin = await createAdminClient();
  if (!supabaseAdmin) return [];

  const { data } = await supabaseAdmin.from('workspaces').select('*');

  return data || [];
}
