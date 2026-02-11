import { createClient } from '@tuturuuu/supabase/next/server';
import TaskLabelsClient from '@tuturuuu/ui/tu-do/labels/client';
import type { TaskLabel } from '@tuturuuu/ui/tu-do/labels/types';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskLabelsPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const wsId = workspace.id;

  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const supabase = await createClient();
  const { data: labels } = await supabase
    .from('workspace_task_labels')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  const t = await getTranslations('ws-tasks-labels');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-bold text-2xl tracking-tight">{t('header')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <TaskLabelsClient
        wsId={wsId}
        initialLabels={(labels ?? []) as TaskLabel[]}
      />
    </div>
  );
}
