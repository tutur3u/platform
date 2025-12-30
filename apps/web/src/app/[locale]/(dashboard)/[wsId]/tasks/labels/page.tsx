import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import TaskLabelsClient from './client';

export const metadata: Metadata = {
  title: 'Labels',
  description: 'Manage Labels in the Tasks area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
  creator_id: string | null;
}

export default async function TaskLabelsPage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  // Check permissions
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  // Fetch labels data
  const { labels } = await getTaskLabels(wsId);

  const t = await getTranslations('ws-tasks-labels');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-bold text-2xl tracking-tight">{t('header')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      {/* Labels Management */}
      <TaskLabelsClient wsId={wsId} initialLabels={labels} />
    </div>
  );
}

async function getTaskLabels(wsId: string): Promise<{ labels: TaskLabel[] }> {
  const supabase = await createClient();

  const { data: labels, error } = await supabase
    .from('workspace_task_labels')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching task labels:', error);
    return { labels: [] };
  }

  return { labels: labels || [] };
}
