import { Calculator } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import TaskEstimatesClient from '@tuturuuu/ui/tu-do/estimates/client';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskEstimatesPage({ params }: Props) {
  const { wsId: id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const workspace = await getWorkspace(id);
  if (!workspace) redirect('/');

  const wsId = workspace.id;

  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const { boards } = await getTaskBoards(wsId);
  const t = await getTranslations('task-estimates');

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-3 rounded-lg border border-border/50 bg-linear-to-r from-dynamic-orange/5 via-background to-background p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
            <Calculator className="h-5 w-5 text-dynamic-orange" />
          </div>
          <div>
            <h1 className="font-bold text-2xl tracking-tight">
              {t('page_title')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t('page_description')}
            </p>
          </div>
        </div>
      </div>
      <TaskEstimatesClient wsId={wsId} initialBoards={boards} />
    </div>
  );
}

async function getTaskBoards(
  wsId: string
): Promise<{ boards: Partial<WorkspaceTaskBoard>[] }> {
  const supabase = await createClient();

  const { data: boards, error } = await supabase
    .from('workspace_boards')
    .select(
      'id, name, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, created_at'
    )
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching task boards:', error);
    return { boards: [] };
  }

  const boardsWithCounts = await Promise.all(
    (boards || []).map(async (board) => {
      const { data: taskLists } = await supabase
        .from('task_lists')
        .select('id')
        .eq('board_id', board.id)
        .eq('deleted', false);

      if (!taskLists || taskLists.length === 0) {
        return {
          ...board,
          name: board.name || 'Untitled Board',
          task_count: 0,
        };
      }

      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in(
          'list_id',
          taskLists.map((l) => l.id)
        )
        .is('deleted_at', null);

      return {
        ...board,
        name: board.name || 'Untitled Board',
        task_count: count || 0,
      };
    })
  );

  return { boards: boardsWithCounts };
}
