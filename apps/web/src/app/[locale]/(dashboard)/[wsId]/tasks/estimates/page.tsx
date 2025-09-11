import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import TaskEstimatesClient from './client';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskEstimatesPage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  // Fetch boards data with estimation types
  const { boards } = await getTaskBoards(wsId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-bold text-2xl tracking-tight">Task Estimation</h1>
        <p className="text-muted-foreground">
          Configure estimation methods for your task boards and view estimation
          analytics
        </p>
      </div>

      {/* Estimation Management */}
      <TaskEstimatesClient wsId={wsId} initialBoards={boards} />
    </div>
  );
}

async function getTaskBoards(
  wsId: string
): Promise<{ boards: Partial<TaskBoard>[] }> {
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
    .eq('deleted', false)
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
        .eq('deleted', false);

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
