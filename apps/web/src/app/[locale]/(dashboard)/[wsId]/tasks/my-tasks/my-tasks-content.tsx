'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Archive,
  Calendar,
  CheckCircle2,
  Clock,
  Flag,
  LayoutDashboard,
  ListTodo,
  NotebookPen,
  Plus,
  Users,
} from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { TaskBoardForm } from '@tuturuuu/ui/tu-do/boards/form';
import { TaskEditDialog } from '@tuturuuu/ui/tu-do/shared/task-edit-dialog';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import BucketDump from '../../(dashboard)/bucket-dump';
import QuickJournal from '../../(dashboard)/quick-journal';
import TaskListWithCompletion from '../../(dashboard)/tasks/task-list-with-completion';
import EmptyState from './empty-state';

interface Task {
  id: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  end_date?: string | null;
  start_date?: string | null;
  estimation_points?: number | null;
  archived?: boolean | null;
  list_id?: string | null;
  list: {
    id: string;
    name: string | null;
    status?: string | null;
    board: {
      id: string;
      name: string | null;
      ws_id: string;
      estimation_type?: string | null;
      extended_estimation?: boolean;
      allow_zero_estimates?: boolean;
      workspaces: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url?: string | null;
    } | null;
  }> | null;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color: string;
      created_at: string;
    } | null;
  }> | null;
}

interface MyTasksContentProps {
  wsId: string;
  isPersonal: boolean;
  overdueTasks: Task[] | undefined;
  todayTasks: Task[] | undefined;
  upcomingTasks: Task[] | undefined;
  totalActiveTasks: number;
}

export default function MyTasksContent({
  wsId,
  isPersonal,
  overdueTasks,
  todayTasks,
  upcomingTasks,
  totalActiveTasks,
}: MyTasksContentProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('tasks');
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);
  const [taskCreatorOpen, setTaskCreatorOpen] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(wsId);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newBoardDialogOpen, setNewBoardDialogOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState<string>('');

  // Fetch user's workspaces (only if in personal workspace)
  const { data: workspacesData } = useQuery({
    queryKey: ['user-workspaces'],
    queryFn: async () => {
      const supabase = createClient();

      // Get user's workspace IDs first
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('ws_id');

      if (memberError) throw memberError;

      const workspaceIds = memberData?.map((m) => m.ws_id) || [];
      if (workspaceIds.length === 0) return [];

      // Fetch unique workspaces
      const { data, error } = await supabase
        .from('workspaces')
        .select('id, name, personal')
        .in('id', workspaceIds)
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: isPersonal && boardSelectorOpen,
  });

  // Fetch all boards with their lists for selected workspace
  const { data: boardsData = [], isLoading: boardsLoading } = useQuery({
    queryKey: ['workspace', selectedWorkspaceId, 'boards-with-lists'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: boards, error } = await supabase
        .from('workspace_boards')
        .select(
          `
          id,
          name,
          task_lists(id, name, status, position, deleted)
        `
        )
        .eq('ws_id', selectedWorkspaceId)
        .eq('deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return boards || [];
    },
    enabled: (boardSelectorOpen || taskCreatorOpen) && !!selectedWorkspaceId,
  });

  // Get available lists for selected board
  const availableLists = useMemo(() => {
    if (!selectedBoardId || !boardsData || !Array.isArray(boardsData))
      return [];
    const board = boardsData.find((b: any) => b.id === selectedBoardId);
    if (!board?.task_lists) return [];
    return (board.task_lists as any[])
      .filter((l: any) => !l.deleted)
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
  }, [selectedBoardId, boardsData]);

  // Auto-select first workspace when dialog opens (personal workspace only)
  useMemo(() => {
    if (
      isPersonal &&
      boardSelectorOpen &&
      workspacesData &&
      workspacesData.length > 0 &&
      !selectedWorkspaceId
    ) {
      setSelectedWorkspaceId(workspacesData?.[0]?.id || '');
    }
  }, [isPersonal, boardSelectorOpen, workspacesData, selectedWorkspaceId]);

  // Auto-select first board and list when dialog opens or workspace changes
  useMemo(() => {
    if (
      boardSelectorOpen &&
      boardsData &&
      boardsData.length > 0 &&
      !selectedBoardId
    ) {
      const firstBoard = boardsData[0] as any;
      setSelectedBoardId(firstBoard.id);

      const lists = (firstBoard.task_lists as any[]) || [];
      const firstList = lists
        .filter(
          (l: any) => l.status !== 'done' && l.status !== 'closed' && !l.deleted
        )
        .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))[0];

      if (firstList) {
        setSelectedListId(firstList.id);
      }
    }
  }, [boardSelectorOpen, boardsData, selectedBoardId]);

  // Auto-select first list when board changes
  useMemo(() => {
    if (selectedBoardId && availableLists.length > 0) {
      const currentListExists = availableLists.some(
        (l: any) => l.id === selectedListId
      );
      if (!currentListExists) {
        setSelectedListId(availableLists[0].id);
      }
    }
  }, [selectedBoardId, availableLists, selectedListId]);

  const handleUpdate = () => {
    // Trigger refresh of task lists
    window.location.reload();
  };

  const handleOpenBoardSelector = () => {
    setBoardSelectorOpen(true);
  };

  const handleProceedToTaskCreation = () => {
    if (!selectedBoardId || !selectedListId) return;
    setBoardSelectorOpen(false);
    setTaskCreatorOpen(true);
  };

  const handleCloseTaskCreator = () => {
    setTaskCreatorOpen(false);
    // Reset selections for next time
    setSelectedWorkspaceId(wsId);
    setSelectedBoardId('');
    setSelectedListId('');
  };

  // Reset board selection when workspace changes
  useMemo(() => {
    if (selectedWorkspaceId && boardSelectorOpen) {
      setSelectedBoardId('');
      setSelectedListId('');
    }
  }, [selectedWorkspaceId, boardSelectorOpen]);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-3">
        <TabsTrigger
          value="tasks"
          className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs sm:text-sm">
            {t('sidebar_tabs.my_tasks')}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="journal"
          className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
        >
          <NotebookPen className="h-4 w-4" />
          <span className="text-xs sm:text-sm">Journal</span>
        </TabsTrigger>
        <TabsTrigger
          value="bucket"
          className="flex-col gap-1.5 py-2 sm:flex-row sm:py-1.5"
        >
          <Archive className="h-4 w-4" />
          <span className="text-xs sm:text-sm">Bucket</span>
        </TabsTrigger>
      </TabsList>

      {/* My Tasks Tab */}
      <TabsContent value="tasks" className="mt-6 space-y-6">
        <Button
          onClick={handleOpenBoardSelector}
          className="w-full sm:w-auto"
          size="lg"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Task
        </Button>
        {/* Overdue Tasks */}
        {overdueTasks && overdueTasks.length > 0 && (
          <Card className="border-dynamic-red/20">
            <CardHeader className="border-dynamic-red/10 border-b bg-dynamic-red/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-red">
                <Clock className="h-5 w-5" />
                {t('ws-tasks.overdue')} ({overdueTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={overdueTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Due Today */}
        {todayTasks && todayTasks.length > 0 && (
          <Card className="border-dynamic-orange/20">
            <CardHeader className="border-dynamic-orange/10 border-b bg-dynamic-orange/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-orange">
                <Calendar className="h-5 w-5" />
                {t('ws-tasks.due_today')} ({todayTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={todayTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Upcoming Tasks */}
        {upcomingTasks && upcomingTasks.length > 0 && (
          <Card className="border-dynamic-blue/20">
            <CardHeader className="border-dynamic-blue/10 border-b bg-dynamic-blue/5">
              <CardTitle className="flex items-center gap-2 text-dynamic-blue">
                <Flag className="h-5 w-5" />
                {t('ws-tasks.upcoming')} ({upcomingTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TaskListWithCompletion
                tasks={upcomingTasks as any}
                isPersonal={isPersonal}
                initialLimit={5}
              />
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {totalActiveTasks === 0 && (
          <EmptyState
            wsId={wsId}
            onSwitchToJournal={() => setActiveTab('journal')}
            onCreateTask={handleOpenBoardSelector}
          />
        )}
      </TabsContent>

      {/* Quick Journal Tab */}
      <TabsContent value="journal" className="mt-6">
        <QuickJournal wsId={wsId} enabled={true} />
      </TabsContent>

      {/* Bucket Dump Tab */}
      <TabsContent value="bucket" className="mt-6">
        <BucketDump wsId={wsId} enabled={true} />
      </TabsContent>

      {/* Board & List Selection Dialog */}
      <Dialog open={boardSelectorOpen} onOpenChange={setBoardSelectorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10">
                <LayoutDashboard className="h-4 w-4 text-dynamic-orange" />
              </div>
              Select Board & List
            </DialogTitle>
            <DialogDescription>
              Choose where to create your new task
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Workspace Selection (Personal workspace only) */}
            {isPersonal && workspacesData && workspacesData.length > 0 && (
              <div className="space-y-2">
                <Label
                  htmlFor="workspace-select"
                  className="flex items-center gap-2"
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Workspace
                </Label>
                <Select
                  value={selectedWorkspaceId}
                  onValueChange={setSelectedWorkspaceId}
                >
                  <SelectTrigger id="workspace-select" className="w-full">
                    <SelectValue placeholder="Select a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspacesData.map((workspace: any) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspace.name || 'Unnamed Workspace'}
                        {workspace.personal && ' (Personal)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Board Selection */}
            <div className="space-y-2">
              <Label htmlFor="board-select" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                Board
              </Label>
              <Combobox
                t={t}
                mode="single"
                options={
                  Array.isArray(boardsData)
                    ? boardsData.map((board: any) => ({
                        value: board.id,
                        label: board.name || 'Unnamed Board',
                      }))
                    : []
                }
                label={boardsLoading ? 'Loading...' : undefined}
                placeholder="Select a board"
                selected={selectedBoardId}
                onChange={(value) => setSelectedBoardId(value as string)}
                onCreate={(name) => {
                  setNewBoardName(name);
                  setNewBoardDialogOpen(true);
                }}
                disabled={boardsLoading}
                className="w-full"
              />
            </div>

            {/* List Selection */}
            <div className="space-y-2">
              <Label htmlFor="list-select" className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
                List
              </Label>
              <Select
                value={selectedListId}
                onValueChange={setSelectedListId}
                disabled={!selectedBoardId || availableLists.length === 0}
              >
                <SelectTrigger id="list-select">
                  <SelectValue
                    placeholder={
                      !selectedBoardId
                        ? 'Select a board first'
                        : availableLists.length === 0
                          ? 'No lists available'
                          : 'Select a list'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableLists.map((list: any) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name || 'Unnamed List'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedBoardId && availableLists.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  This board has no available lists. Create a list first.
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBoardSelectorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleProceedToTaskCreation}
              disabled={!selectedBoardId || !selectedListId}
            >
              <Plus className="mr-2 h-4 w-4" />
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Board Creation Dialog */}
      <Dialog open={newBoardDialogOpen} onOpenChange={setNewBoardDialogOpen}>
        <DialogContent
          className="p-0"
          style={{
            maxWidth: '1200px',
            width: '85vw',
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <TaskBoardForm
            wsId={selectedWorkspaceId}
            data={{ name: newBoardName } as any}
            onFinish={() => {
              setNewBoardDialogOpen(false);
              setNewBoardName('');
              queryClient.invalidateQueries({
                queryKey: [
                  'workspace',
                  selectedWorkspaceId,
                  'boards-with-lists',
                ],
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Task Creation Dialog */}
      {selectedBoardId && selectedListId && (
        <TaskEditDialog
          task={
            {
              id: 'new',
              name: '',
              description: '',
              priority: null,
              start_date: null,
              end_date: null,
              estimation_points: null,
              list_id: selectedListId,
              labels: [],
              archived: false,
              assignees: [],
              projects: [],
            } as any
          }
          boardId={selectedBoardId}
          isOpen={taskCreatorOpen}
          onClose={handleCloseTaskCreator}
          onUpdate={handleUpdate}
          mode="create"
        />
      )}
    </Tabs>
  );
}
