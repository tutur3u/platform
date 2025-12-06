import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import LogsClient from './logs-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tasks-logs');
  return {
    title: t('title', { defaultValue: 'Activity Logs' }),
    description: t('description', {
      defaultValue: 'View task change history across your workspace',
    }),
  };
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

interface Board {
  id: string;
  name: string | null;
}

export default async function TaskLogsPage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  // Check permissions
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  // Fetch boards for filter dropdown
  const { boards } = await getWorkspaceBoards(wsId);

  return <LogsClient wsId={wsId} boards={boards} />;
}

async function getWorkspaceBoards(wsId: string): Promise<{ boards: Board[] }> {
  const supabase = await createClient();

  const { data: boards, error } = await supabase
    .from('workspace_boards')
    .select('id, name')
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching workspace boards:', error);
    return { boards: [] };
  }

  return { boards: boards || [] };
}
