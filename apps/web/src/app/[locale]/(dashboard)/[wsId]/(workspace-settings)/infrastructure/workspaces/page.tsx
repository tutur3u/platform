import WorkspaceCard from '../../../../../../../components/cards/WorkspaceCard';
import { enforceRootWorkspaceAdmin } from '@/lib/workspace-helper';
import { createAdminClient } from '@tutur3u/supabase/next/server';
import { Workspace } from '@tutur3u/types/primitives/Workspace';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { notFound } from 'next/navigation';

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
  if (!supabaseAdmin) notFound();

  const { data } = await supabaseAdmin.from('workspaces').select('*');

  return data as Workspace[];
}
