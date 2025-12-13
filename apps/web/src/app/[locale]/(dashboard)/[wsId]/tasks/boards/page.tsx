import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { EnhancedBoardsView } from '@tuturuuu/ui/tu-do/boards/enhanced-boards-view';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { QuickCreateBoardDialog } from '@tuturuuu/ui/tu-do/boards/quick-create-board-dialog';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Boards',
  description: 'Manage Boards in the Tasks area of your Tuturuuu workspace.',
};

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

async function getBoardsData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_boards')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .order('name', { ascending: true })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const parsedPage = parseInt(page, 10);
  const parsedSize = parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedSize;
  const end = start + parsedSize - 1;
  queryBuilder.range(start, end).limit(parsedSize);

  const { data: boards, error: boardsError, count } = await queryBuilder;
  if (boardsError) throw boardsError;

  if (!boards || boards.length === 0) {
    return { data: [], count: 0 } as {
      data: WorkspaceTaskBoard[];
      count: number;
    };
  }

  const { data: taskLists, error: listsError } = await supabase
    .from('task_lists')
    .select('id, name, status, color, position, archived, board_id')
    .in(
      'board_id',
      boards.map((b) => b.id)
    )
    .eq('deleted', false);
  if (listsError) throw listsError;

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

  const boardsWithData = boards.map((board) => ({
    ...board,
    task_lists: (taskLists || [])
      .filter((list) => list.board_id === board.id)
      .map((list) => ({
        ...list,
        tasks: (tasks || []).filter((task) => task.list_id === list.id),
      })),
  })) as WorkspaceTaskBoard[];

  return { data: boardsWithData, count: count ?? 0 };
}

export default async function ProjectsPage({ params, searchParams }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const sp = await searchParams;
        const q = sp.q || '';
        const page = sp.page || '1';
        const pageSize = sp.pageSize || '10';

        const { withoutPermission } = await getPermissions({ wsId });
        if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

        const queryClient = new QueryClient();
        const boardsQueryKey = ['boards', wsId, q, page, pageSize];
        const initialBoards = await getBoardsData(wsId, { q, page, pageSize });
        queryClient.setQueryData(boardsQueryKey, initialBoards);

        return (
          <div className="space-y-6">
            <FeatureSummary
              pluralTitle={t('ws-task-boards.plural')}
              singularTitle={t('ws-task-boards.singular')}
              description={t('ws-task-boards.description')}
              createTitle={t('ws-task-boards.create')}
              createDescription={t('ws-task-boards.create_description')}
              action={
                <TaskBoardForm wsId={wsId}>
                  <Button className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    {t('ws-task-boards.create')}
                  </Button>
                </TaskBoardForm>
              }
            />

            <Separator />

            <HydrationBoundary state={dehydrate(queryClient)}>
              <QuickCreateBoardDialog
                wsId={wsId}
                openWhenEmpty={q.trim() === '' && initialBoards.count === 0}
              />
              <EnhancedBoardsView wsId={wsId} />
            </HydrationBoundary>
          </div>
        );
      }}
    </WorkspaceWrapper>
  );
}
