import { EnhancedTaskBoardsContent } from './enhanced-content';
import { TaskBoardForm } from './form';
import { createClient } from '@tuturuuu/supabase/next/server';
import { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { EnhancedBoard } from './types';

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

export default async function WorkspaceProjectsPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);

  // Check if the current user is a workspace owner/creator
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();
  
  const isOwner = Boolean(user && workspace && workspace.creator_id === user.id);

  const { data: rawData, count } = await getData(wsId, await searchParams);
  const t = await getTranslations();

  // Transform data for enhanced boards
  const enhancedBoards: EnhancedBoard[] = await Promise.all(
    rawData.map(async (board, index) => {
      const boardStats = await getBoardStats(board.id);
      
      // Sample group assignment based on board name or index
      const groups = ['gaming', 'robotics', 'marketing', 'development', 'design'];
      const groupId = groups[index % groups.length];
      
      return {
        ...board,
        href: `/${wsId}/tasks/boards/${board.id}`,
        stats: boardStats,
        groupId,
      };
    })
  );

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-task-boards.plural')}
        singularTitle={t('ws-task-boards.singular')}
        description={t('ws-task-boards.description')}
        createTitle={t('ws-task-boards.create')}
        createDescription={t('ws-task-boards.create_description')}
        form={<TaskBoardForm wsId={wsId} />}
        requireExpansion
      />
      <Separator className="my-4" />
      <EnhancedTaskBoardsContent 
        boards={enhancedBoards} 
        count={count} 
        wsId={wsId} 
        isOwner={isOwner}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '5',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_boards')
    .select('*', {
      count: 'exact',
    })
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

async function getBoardStats(boardId: string) {
  const supabase = await createClient();
  
  // Get all tasks for this board with assignee information
  const { data: tasks } = await supabase
    .from('tasks')
    .select(`
      id, 
      list_id, 
      priority, 
      end_date,
      task_assignees!inner(user_id, workspace_users!inner(display_name))
    `)
    .eq('board_id', boardId);

  // Get all lists for this board with their status
  const { data: lists } = await supabase
    .from('task_lists')
    .select('id, status')
    .eq('board_id', boardId);

  const totalTasks = tasks?.length || 0;
  
  // Create a map of list_id to status for quick lookup
  const listStatusMap = new Map(lists?.map(list => [list.id, list.status]) || []);
  
  // Calculate task statuses based on which list they're in
  const completedTasks = tasks?.filter(task => {
    const listStatus = listStatusMap.get(task.list_id);
    return listStatus === 'done' || listStatus === 'closed';
  }).length || 0;
  
  const activeTasks = tasks?.filter(task => {
    const listStatus = listStatusMap.get(task.list_id);
    return listStatus === 'active' || listStatus === 'not_started';
  }).length || 0;
  
  const now = new Date();
  const overdueTasks = tasks?.filter(task => {
    const listStatus = listStatusMap.get(task.list_id);
    return task.end_date && 
           new Date(task.end_date) < now && 
           (listStatus !== 'done' && listStatus !== 'closed');
  }).length || 0;

  // Priority distribution - simplified since we don't know the exact priority values
  const priorityDistribution = {
    low: tasks?.filter(t => t.priority === 1).length || 0,
    medium: tasks?.filter(t => t.priority === 2).length || 0,
    high: tasks?.filter(t => t.priority === 3).length || 0,
    urgent: tasks?.filter(t => t.priority === 4).length || 0,
  };

  // Status distribution based on list statuses
  const statusDistribution = {
    not_started: tasks?.filter(task => listStatusMap.get(task.list_id) === 'not_started').length || 0,
    active: tasks?.filter(task => listStatusMap.get(task.list_id) === 'active').length || 0,
    done: tasks?.filter(task => listStatusMap.get(task.list_id) === 'done').length || 0,
    closed: tasks?.filter(task => listStatusMap.get(task.list_id) === 'closed').length || 0,
  };

  // Workload analysis
  const assigneeWorkload = tasks?.reduce((acc, task) => {
    task.task_assignees?.forEach((assignee: any) => {
      const userId = assignee.user_id;
      const userName = assignee.workspace_users?.display_name || 'Unknown';
      
      if (!acc[userId]) {
        acc[userId] = { userId, name: userName, taskCount: 0 };
      }
      acc[userId].taskCount++;
    });
    return acc;
  }, {} as Record<string, { userId: string; name: string; taskCount: number }>) || {};

  const workloadStats = Object.values(assigneeWorkload);
  const avgTasksPerPerson = workloadStats.length > 0 
    ? workloadStats.reduce((sum, stat) => sum + stat.taskCount, 0) / workloadStats.length 
    : 0;
  
  // Mark users as overloaded if they have >150% of average tasks
  const assigneeWorkloadArray = workloadStats.map(stat => ({
    ...stat,
    isOverloaded: stat.taskCount > avgTasksPerPerson * 1.5 && avgTasksPerPerson > 0
  }));

  // Smart detection flags
  const hasUrgentTasks = priorityDistribution.urgent > 0;
  const hasMultipleOverdue = overdueTasks >= 2;
  const hasWorkloadImbalance = assigneeWorkloadArray.some(assignee => assignee.isOverloaded);

  return {
    totalTasks,
    completedTasks,
    activeTasks,
    overdueTasks,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    priorityDistribution,
    statusDistribution,
    totalLists: lists?.length || 0,
    lastActivity: new Date().toISOString(), // You might want to get actual last activity
    assigneeWorkload: assigneeWorkloadArray,
    hasUrgentTasks,
    hasMultipleOverdue,
    hasWorkloadImbalance,
  };
}
