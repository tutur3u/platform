import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EnhancedBoardsView } from './enhanced-boards-view';
import { TaskBoardForm } from './form';
import { QuickCreateBoardDialog } from './quick-create-board-dialog';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  // Build the main query for boards
  const queryBuilder = supabase
    .from('workspace_boards')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('name', { ascending: true })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: boards, error: boardsError, count } = await queryBuilder;
  if (boardsError) throw boardsError;

  if (!boards || boards.length === 0) {
    return { data: [], count: 0 };
  }

  // Fetch task lists with proper deleted filter
  const { data: taskLists, error: listsError } = await supabase
    .from('task_lists')
    .select('id, name, status, color, position, archived, board_id')
    .in(
      'board_id',
      boards.map((b) => b.id)
    )
    .eq('deleted', false);

  if (listsError) throw listsError;

  // Fetch tasks with proper deleted filter
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select(
      'id, name, description, closed_at, priority, start_date, end_date, created_at, list_id'
    )
    .in(
      'list_id',
      (taskLists || []).map((l) => l.id)
    )
    .is('deleted_at', null);

  if (tasksError) throw tasksError;

  // Group data by board
  const boardsWithData = boards.map((board) => ({
    ...board,
    task_lists: (taskLists || [])
      .filter((list) => list.board_id === board.id)
      .map((list) => ({
        ...list,
        tasks: (tasks || []).filter((task) => task.list_id === list.id),
      })),
  }));

  return { data: boardsWithData, count } as {
    data: WorkspaceTaskBoard[];
    count: number;
  };
}

export default async function WorkspaceProjectsPage({
  params,
  searchParams,
}: Props) {
  const { wsId: id } = await params;
  const sp = await searchParams;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const queryClient = new QueryClient();
  const q = sp.q || '';
  const page = sp.page || '1';
  const pageSize = sp.pageSize || '10';

  const boardsQueryKey = ['boards', wsId, q, page, pageSize];
  const initialBoards = await getData(wsId, { q, page, pageSize });
  // Avoid duplicate DB calls by seeding the dehydrated cache directly
  queryClient.setQueryData(boardsQueryKey, initialBoards);

  const t = await getTranslations();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="font-bold text-2xl tracking-tight">
            {t('ws-task-boards.plural')}
          </h1>
          <p className="text-muted-foreground">
            {t('ws-task-boards.description')}
          </p>
        </div>
        <TaskBoardForm wsId={wsId}>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {t('ws-task-boards.create')}
          </Button>
        </TaskBoardForm>
      </div>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <QuickCreateBoardDialog
          wsId={wsId}
          openWhenEmpty={q.trim() === '' && initialBoards.count === 0}
        />
        <EnhancedBoardsView wsId={wsId} />
      </HydrationBoundary>
    </div>
  );
}
