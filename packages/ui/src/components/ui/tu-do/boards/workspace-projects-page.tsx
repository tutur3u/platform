import {
  QueryClient,
  HydrationBoundary,
  dehydrate,
} from '@tanstack/react-query';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  getWorkspaces,
  isPersonalWorkspace,
} from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { EnhancedBoardsView } from './enhanced-boards-view';
import { WorkspaceProjectsHeader } from './workspace-projects-header';

interface Props {
  wsId: string;
  searchParams: {
    q?: string;
    page?: string;
    pageSize?: string;
  };
}

async function getData({
  wsIds,
  q,
  page = '1',
  pageSize = '10',
}: {
  wsIds: string[];
  q?: string;
  page?: string;
  pageSize?: string;
}) {
  const supabase = await createClient();

  // Build the main query for boards
  const queryBuilder = supabase
    .from('workspace_boards')
    .select('*', { count: 'exact' })
    .in('ws_id', wsIds)
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
  wsId,
  searchParams,
}: Props) {
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const queryClient = new QueryClient();
  const q = searchParams.q || '';
  const page = searchParams.page || '1';
  const pageSize = searchParams.pageSize || '10';

  const isPersonal = await isPersonalWorkspace(wsId);
  const workspaces = await getWorkspaces();
  const personalWorkspace = workspaces?.find((ws) => ws.personal);

  const wsIds =
    isPersonal && workspaces ? workspaces.map((ws) => ws.id) : [wsId];

  const queryKey = isPersonal
    ? ['all-boards', wsIds, q, page, pageSize]
    : ['boards', wsId, q, page, pageSize];

  await queryClient.prefetchQuery({
    queryKey,
    queryFn: () => getData({ wsIds, q, page, pageSize }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <WorkspaceProjectsHeader
        wsId={wsId}
        wsIds={wsIds}
        isPersonal={isPersonal}
        workspaces={workspaces}
        personalWorkspaceId={personalWorkspace?.id}
        defaultWsId={wsId}
      />
    </HydrationBoundary>
  );
}
