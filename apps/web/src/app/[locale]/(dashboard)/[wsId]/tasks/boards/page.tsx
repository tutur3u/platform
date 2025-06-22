import { projectColumns } from './columns';
import { TaskBoardForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { createClient } from '@tuturuuu/supabase/next/server';
import { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import { 
  LayoutGrid, 
  LayoutList, 
  Layers3, 
  RefreshCw, 
  Columns3,
  Filter,
  SortAsc,
  Settings2,
  Plus,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

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

  const { data: rawData, count } = await getData(wsId, await searchParams);
  const t = await getTranslations();

  const data = rawData.map((board: any) => {
    // Calculate task metrics using the same logic as BoardHeader
    const allTasks = board.task_lists?.flatMap((list: any) => list.tasks || []) || [];
    const totalTasks = allTasks.length;
    
    // Use same logic as BoardHeader: completed = tasks that are archived OR in 'done'/'closed' lists
    const completedTasks = allTasks.filter((task: any) => {
      const taskList = board.task_lists?.find((list: any) => list.id === task.list_id);
      return task.archived || taskList?.status === 'done' || taskList?.status === 'closed';
    }).length;
    
    const activeTasks = allTasks.filter((task: any) => {
      const taskList = board.task_lists?.find((list: any) => list.id === task.list_id);
      return !task.archived && taskList?.status === 'active';
    }).length;
    
    const overdueTasks = allTasks.filter((task: any) => {
      const taskList = board.task_lists?.find((list: any) => list.id === task.list_id);
      return !task.archived && taskList?.status !== 'done' && taskList?.status !== 'closed' && 
             task.end_date && new Date(task.end_date) < new Date();
    }).length;
    
    const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Priority breakdown for non-completed tasks
    const highPriorityTasks = allTasks.filter((task: any) => {
      const taskList = board.task_lists?.find((list: any) => list.id === task.list_id);
      return task.priority === 1 && !task.archived && taskList?.status !== 'done' && taskList?.status !== 'closed';
    }).length;
    
    const mediumPriorityTasks = allTasks.filter((task: any) => {
      const taskList = board.task_lists?.find((list: any) => list.id === task.list_id);
      return task.priority === 2 && !task.archived && taskList?.status !== 'done' && taskList?.status !== 'closed';
    }).length;
    
    const lowPriorityTasks = allTasks.filter((task: any) => {
      const taskList = board.task_lists?.find((list: any) => list.id === task.list_id);
      return task.priority === 3 && !task.archived && taskList?.status !== 'done' && taskList?.status !== 'closed';
    }).length;

    return {
      ...board,
      tags: board.tags ? (typeof board.tags === 'string' ? JSON.parse(board.tags) : board.tags) : [],
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

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <LayoutList className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">Total Boards</p>
              <p className="text-2xl font-bold">{count || 0}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">Active Boards</p>
              <p className="text-2xl font-bold">{data.filter(board => !board.archived).length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-sm text-muted-foreground">Tagged Boards</p>
              <p className="text-2xl font-bold">{data.filter(board => board.tags && board.tags.length > 0).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="space-y-6">
        <Tabs defaultValue="table" className="w-full">
          {/* Unified Toolbar */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-1">
            <div className="flex items-center gap-1">
              {/* View Switcher */}
              <TabsList className="grid grid-cols-3 bg-background shadow-sm">
                <TabsTrigger
                  value="table"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutList className="h-4 w-4" />
                  <span className="hidden sm:inline">Table</span>
                </TabsTrigger>
                <TabsTrigger
                  value="cards"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Cards</span>
                </TabsTrigger>
                <TabsTrigger
                  value="groups"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Layers3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Groups</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Contextual Actions */}
            <div className="flex items-center gap-1">
              {/* Table View Actions */}
              <TabsContent value="table" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <div className="mx-1 h-4 w-px bg-border" />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Columns3 className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Cards View Actions */}
              <TabsContent value="cards" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Groups View Actions */}
              <TabsContent value="groups" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Layers3 className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Global Actions */}
              <div className="mx-1 h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {/* Table View */}
            <TabsContent value="table" className="mt-0 space-y-4">
              <CustomDataTable
                columnGenerator={projectColumns}
                namespace="basic-data-table"
                data={data}
                count={count}
                hideToolbar={true}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
              />
            </TabsContent>

            {/* Cards View */}
            <TabsContent value="cards" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.map((board) => (
                  <div
                    key={board.id}
                    className="group relative rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/20"
                  >
                    <a href={board.href} className="absolute inset-0 z-10" aria-label={`View ${board.name}`} />
                    
                    {/* Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                          {board.name}
                        </h3>
                        {board.archived && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            Archived
                          </span>
                        )}
                      </div>
                      
                      {/* Tags */}
                      {board.tags && board.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {board.tags.slice(0, 2).map((tag: string, index: number) => (
                            <span
                              key={index}
                              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                            >
                              {tag}
                            </span>
                          ))}
                          {board.tags.length > 2 && (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                              +{board.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progress Section */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-muted-foreground">Progress</span>
                        <span className="text-sm font-bold">{board.progressPercentage}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary rounded-full h-2 transition-all duration-300"
                          style={{ width: `${board.progressPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Task Stats */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                        <div>
                          <p className="text-lg font-bold">{board.totalTasks}</p>
                          <p className="text-xs text-muted-foreground">Total Tasks</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <div>
                          <p className="text-lg font-bold">{board.completedTasks}</p>
                          <p className="text-xs text-muted-foreground">Completed</p>
                        </div>
                      </div>
                    </div>

                    {/* Additional Metrics */}
                    {(board.overdueTasks > 0 || board.highPriorityTasks > 0) && (
                      <div className="flex items-center gap-4 mb-3 text-xs">
                        {board.overdueTasks > 0 && (
                          <div className="flex items-center gap-1 text-red-600">
                            <Clock className="h-3 w-3" />
                            <span>{board.overdueTasks} overdue</span>
                          </div>
                        )}
                        {board.highPriorityTasks > 0 && (
                          <div className="flex items-center gap-1 text-orange-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{board.highPriorityTasks} high priority</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(board.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-primary font-medium">Open Board</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {data.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center">
                  <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">No boards found</h3>
                  <p className="text-sm text-muted-foreground">
                    Create your first task board to get started.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Groups View */}
            <TabsContent value="groups" className="mt-0 space-y-4">
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center">
                <Layers3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">Groups View</h3>
                <p className="text-sm text-muted-foreground">
                  This view will organize boards by groups with color coding.
                  <br />
                  Coming soon...
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
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
    .select(`
      *,
      task_lists!board_id (
        id,
        name,
        status,
        tasks!list_id (
          id,
          name,
          archived,
          priority,
          end_date
        )
      )
    `, {
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
