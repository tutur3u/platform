import { Calculator } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import TaskEstimatesClient from './client';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('task-estimates');
  return {
    title: t('page_title'),
    description: t('page_description'),
  };
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskEstimatesPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { withoutPermission } = await getPermissions({
          wsId,
        });
        if (withoutPermission('manage_projects')) redirect(`/${wsId}`);
        // Fetch boards data with estimation types
        const { boards } = await getTaskBoards(wsId);

        const t = await getTranslations('task-estimates');

        return (
          <div className="space-y-6 pb-8">
            {/* Header with gradient accent matching task-edit-dialog pattern */}
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

            {/* Estimation Management */}
            <TaskEstimatesClient wsId={wsId} initialBoards={boards} />
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getTaskBoards(
  wsId: string
): Promise<{ boards: Partial<WorkspaceTaskBoard>[] }> {
  const supabase = await createClient();

  // Get boards first
  const { data: boards, error } = await supabase
    .from('workspace_boards')
    .select(`
      id,
      name,
      estimation_type,
      extended_estimation,
      allow_zero_estimates,
      count_unestimated_issues,
      created_at
    `)
    .eq('ws_id', wsId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching task boards:', error);
    return { boards: [] };
  }

  // Get task counts for each board
  const boardsWithCounts = await Promise.all(
    (boards || []).map(async (board) => {
      // Get task lists for this board first
      const { data: taskLists } = await supabase
        .from('task_lists')
        .select('id')
        .eq('board_id', board.id)
        .eq('deleted', false);

      if (!taskLists || taskLists.length === 0) {
        return {
          id: board.id,
          name: board.name || 'Untitled Board',
          estimation_type: board.estimation_type,
          extended_estimation: board.extended_estimation,
          allow_zero_estimates: board.allow_zero_estimates,
          count_unestimated_issues: board.count_unestimated_issues,
          created_at: board.created_at,
          task_count: 0,
        };
      }

      // Count tasks across all lists in this board
      const { count } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in(
          'list_id',
          taskLists.map((list) => list.id)
        )
        .is('deleted_at', null);

      return {
        id: board.id,
        name: board.name || 'Untitled Board',
        estimation_type: board.estimation_type,
        extended_estimation: board.extended_estimation,
        allow_zero_estimates: board.allow_zero_estimates,
        count_unestimated_issues: board.count_unestimated_issues,
        created_at: board.created_at,
        task_count: count || 0,
      };
    })
  );

  return { boards: boardsWithCounts };
}
