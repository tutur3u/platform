import { createClient } from '@tuturuuu/supabase/next/server';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EnhancedBoardsView } from './enhanced-boards-view';
import { TaskBoardForm } from './form';

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

interface Task {
  id: string;
  list_id: string;
  archived?: boolean;
  end_date?: string;
  priority?: number;
  // Add other relevant fields as needed
}

interface TaskList {
  id: string;
  status: string;
  tasks?: Task[];
}

interface Board {
  id: string;
  name: string;
  archived?: boolean;
  deleted?: boolean;
  tags?: string[];
  task_lists?: TaskList[];
  created_at?: string;
  creator_id?: string;
  ws_id?: string;
  // Add other relevant fields as needed
}

export default async function WorkspaceProjectsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  const { data: rawData, count } = await getData(wsId, await searchParams);
  const t = await getTranslations();

  const data = rawData.map((board: Board) => {
    // Calculate task metrics using the same logic as BoardHeader
    const allTasks =
      board.task_lists?.flatMap((list: TaskList) => list.tasks || []) || [];
    const totalTasks = allTasks.length;

    // Use same logic as BoardHeader: completed = tasks that are archived OR in 'done'/'closed' lists
    const completedTasks = allTasks.filter((task: Task) => {
      const taskList = board.task_lists?.find(
        (list: TaskList) => list.id === task.list_id
      );
      return (
        task.archived ||
        (taskList &&
          (taskList.status === 'done' || taskList.status === 'closed'))
      );
    }).length;

    const activeTasks = allTasks.filter((task: Task) => {
      const taskList = board.task_lists?.find(
        (list: TaskList) => list.id === task.list_id
      );
      return !task.archived && taskList?.status === 'active';
    }).length;

    const overdueTasks = allTasks.filter((task: Task) => {
      const taskList = board.task_lists?.find(
        (list: TaskList) => list.id === task.list_id
      );
      return (
        !task.archived &&
        taskList?.status !== 'done' &&
        taskList?.status !== 'closed' &&
        task.end_date &&
        new Date(task.end_date) < new Date()
      );
    }).length;

    const progressPercentage =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Priority breakdown for non-completed tasks
    const highPriorityTasks = allTasks.filter((task: Task) => {
      const taskList = board.task_lists?.find(
        (list: TaskList) => list.id === task.list_id
      );
      return (
        task.priority === 1 &&
        !task.archived &&
        taskList?.status !== 'done' &&
        taskList?.status !== 'closed'
      );
    }).length;

    const mediumPriorityTasks = allTasks.filter((task: Task) => {
      const taskList = board.task_lists?.find(
        (list: TaskList) => list.id === task.list_id
      );
      return (
        task.priority === 2 &&
        !task.archived &&
        taskList?.status !== 'done' &&
        taskList?.status !== 'closed'
      );
    }).length;

    const lowPriorityTasks = allTasks.filter((task: Task) => {
      const taskList = board.task_lists?.find(
        (list: TaskList) => list.id === task.list_id
      );
      return (
        task.priority === 3 &&
        !task.archived &&
        taskList?.status !== 'done' &&
        taskList?.status !== 'closed'
      );
    }).length;

    return {
      ...board,
      tags: board.tags
        ? typeof board.tags === 'string'
          ? JSON.parse(board.tags)
          : board.tags
        : [],
      href: `/${wsId}/tasks/boards/${board.id}`,
      // Task metrics
      totalTasks,
      completedTasks,
      activeTasks,
      overdueTasks,
      progressPercentage,
      highPriorityTasks,
      mediumPriorityTasks,
      lowPriorityTasks,
      // Include task_lists for the modal functionality
      task_lists: board.task_lists,
    };
  }) as (TaskBoard & {
    href: string;
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
    overdueTasks: number;
    progressPercentage: number;
    highPriorityTasks: number;
    mediumPriorityTasks: number;
    lowPriorityTasks: number;
  })[];

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
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

      {/* Enhanced Boards View */}
      <EnhancedBoardsView data={data} count={count} />
    </div>
  );
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

  const queryBuilder = supabase
    .from('workspace_boards')
    .select(
      `
      *,
      task_lists!board_id (
        id,
        name,
        status,
        color,
        position,
        archived,
        tasks!list_id (
          id,
          name,
          description,
          archived,
          priority,
          start_date,
          end_date,
          created_at
        )
      )
    `,
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('name', { ascending: true })
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: TaskBoard[]; count: number };
}
