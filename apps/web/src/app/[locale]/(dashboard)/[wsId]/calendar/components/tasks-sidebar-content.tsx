'use client';

import Chat from '../../chat/chat';
import { TaskBoardForm } from '../../tasks/boards/form';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import QuickTaskTimer from './quick-task-timer';
import { TaskForm } from './task-form';
import { TaskListForm } from './task-list-form';
import TimeTracker from './time-tracker';
import type {
  AIChat,
  WorkspaceTask,
  WorkspaceTaskBoard,
} from '@tuturuuu/types/db';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  FilePlus2,
  LayoutDashboard,
  ListPlus,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  PlusCircle,
} from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface TasksSidebarContentProps {
  wsId: string;
  initialTaskBoards: Partial<WorkspaceTaskBoard>[];
  hasKeys?: { openAI: boolean; anthropic: boolean; google: boolean };
  chats?: AIChat[];
  count?: number | null;
  locale?: string;
  hasAiChatAccess?: boolean;
}

// const PriorityIcon = ({ priority }: { priority?: string }) => {
//   const size = 'h-3 w-3';
//   switch (priority?.toLowerCase()) {
//     case 'urgent':
//       return <AlertCircle className={`${size} text-red-500`} />;
//     case 'high':
//       return <AlertCircle className={`${size} text-orange-500`} />;
//     case 'medium':
//       return <Circle className={`${size} text-yellow-500`} />;
//     case 'low':
//       return <Circle className={`${size} text-green-500`} />;
//     default:
//       return <Circle className={`${size} text-gray-400`} />;
//   }
// };

// const StatusIcon = ({ status }: { status?: string }) => {
//   const size = 'h-3 w-3';
//   switch (status?.toLowerCase()) {
//     case 'todo':
//       return <Circle className={`${size} text-blue-500`} />;
//     case 'in progress':
//       return <Clock className={`${size} text-indigo-500`} />;
//     case 'blocked':
//       return <AlertCircle className={`${size} text-pink-500`} />;
//     case 'done':
//       return <CheckCircle2 className={`${size} text-teal-500`} />;
//     case 'cancelled':
//       return <AlertCircle className={`${size} text-slate-500`} />;
//     default:
//       return <Circle className={`${size} text-gray-400`} />;
//   }
// };

export default function TasksSidebarContent({
  wsId,
  initialTaskBoards,
  hasKeys = { openAI: false, anthropic: false, google: false },
  chats = [],
  count = 0,
  locale = 'en',
  hasAiChatAccess = true,
}: TasksSidebarContentProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(
    initialTaskBoards.length > 0 ? (initialTaskBoards[0]?.id ?? null) : null
  );
  const [boardSelectorOpen, setBoardSelectorOpen] = useState(false);

  const [isAddBoardDialogOpen, setIsAddBoardDialogOpen] = useState(false);
  const [addListDialogOpen, setAddListDialogOpen] = useState<{
    [boardId: string]: boolean;
  }>({});
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState<{
    [listId: string]: boolean;
  }>({});

  useEffect(() => {
    if (!selectedBoardId && initialTaskBoards.length > 0) {
      setSelectedBoardId(initialTaskBoards[0]?.id ?? null);
    }
  }, [initialTaskBoards, selectedBoardId]);

  const selectedBoard = useMemo(() => {
    return initialTaskBoards.find((board) => board.id === selectedBoardId);
  }, [initialTaskBoards, selectedBoardId]);

  const handleBoardCreateSuccess = (newBoardId?: string) => {
    setIsAddBoardDialogOpen(false);
    router.refresh();
    if (newBoardId) setSelectedBoardId(newBoardId);
  };

  const handleListCreateSuccess = (boardId: string) => {
    setAddListDialogOpen((prev) => ({ ...prev, [boardId]: false }));
    router.refresh();
  };

  const handleTaskCreateSuccess = (listId: string) => {
    setAddTaskDialogOpen((prev) => ({ ...prev, [listId]: false }));
    router.refresh();
  };

  const listCounts = useMemo(() => {
    if (!selectedBoard) return {};
    return selectedBoard?.lists?.reduce(
      (acc, list) => {
        if (list?.id) acc[list!.id] = list.tasks?.length ?? 0;
        return acc;
      },
      {} as { [listId: string]: number }
    );
  }, [selectedBoard]);

  const totalTasks = useMemo(() => {
    return (
      selectedBoard?.lists?.reduce((total, list) => {
        return total + (list.tasks?.length ?? 0);
      }, 0) ?? 0
    );
  }, [selectedBoard]);

  const completedTasks = useMemo(() => {
    return (
      selectedBoard?.lists?.reduce((total, list) => {
        return (
          total +
          (list.tasks?.filter(
            (task) => (task as any).status?.toLowerCase() === 'done'
          ).length ?? 0)
        );
      }, 0) ?? 0
    );
  }, [selectedBoard]);

  // Get all tasks from all boards for time tracker
  const allTasks = useMemo(() => {
    const tasks: ExtendedWorkspaceTask[] = [];
    initialTaskBoards.forEach((board) => {
      board.lists?.forEach((list) => {
        if (list.tasks) {
          // Transform Partial<WorkspaceTask> to ExtendedWorkspaceTask
          interface TaskWithAssigneeMeta extends Partial<WorkspaceTask> {
            assignee_name?: string;
            assignee_avatar?: string;
            is_assigned_to_current_user?: boolean;
            assignees?: ExtendedWorkspaceTask['assignees'];
          }

          const extendedTasks = list.tasks.map(
            (task): ExtendedWorkspaceTask => {
              const taskMeta = task as TaskWithAssigneeMeta;

              // Type-safe conversion from Partial<WorkspaceTask> to ExtendedWorkspaceTask
              // Convert undefined values to null to match the expected type constraints
              const extendedTask: ExtendedWorkspaceTask = {
                // Required fields (these should always be present)
                id: task.id!,
                name: task.name!,
                list_id: task.list_id!,

                // Optional fields with proper null conversion
                description: task.description ?? null,
                priority: task.priority ?? null,
                start_date: task.start_date ?? null,
                end_date: task.end_date ?? null,
                created_at: task.created_at ?? null,
                creator_id: task.creator_id ?? null,

                // Boolean fields that should be boolean | null (not undefined)
                archived: task.archived ?? null,
                completed: task.completed ?? null,
                deleted: task.deleted ?? null,

                // Extended fields for context
                board_name: board.name ?? undefined,
                list_name: list.name ?? undefined,

                // Keep existing assignee metadata if present
                assignee_name: taskMeta.assignee_name || undefined,
                assignee_avatar: taskMeta.assignee_avatar || undefined,
                is_assigned_to_current_user:
                  taskMeta.is_assigned_to_current_user || undefined,
                assignees: taskMeta.assignees || undefined,
              };

              return extendedTask;
            }
          );
          tasks.push(...extendedTasks);
        }
      });
    });
    return tasks;
  }, [initialTaskBoards]);

  if (isCollapsed) {
    return (
      <div className="ml-2 hidden h-full flex-col items-center rounded-lg border border-border bg-background/50 p-2 shadow-sm backdrop-blur-sm xl:flex">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          aria-label="Expand sidebar"
          className="hover:bg-accent/50"
        >
          <PanelLeftClose className="h-5 w-5 text-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog>
      <div className="@container ml-2 hidden h-full w-1/3 flex-col rounded-lg border border-border bg-background/50 text-foreground shadow-lg backdrop-blur-sm xl:flex">
        {/* Header */}
        <div className="@container flex items-center justify-between rounded-t-lg border-b bg-background/50 px-4 py-3">
          <div className="flex w-full items-center justify-between gap-1">
            <TimeTracker wsId={wsId} tasks={allTasks} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              aria-label="Collapse sidebar"
              className="hover:bg-accent/50"
            >
              <PanelRightClose className="h-5 w-5 text-foreground" />
            </Button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col gap-0"
        >
          <div className="border-b bg-muted/20 p-2">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0">
              <TabsTrigger value="tasks" className="@container">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden @[80px]:inline">Tasks</span>
                <span className="@[80px]:hidden">T</span>
                {totalTasks > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-xs"
                  >
                    {totalTasks}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="ai-chat" className="@container">
                <Bot className="h-4 w-4" />
                <span className="hidden @[80px]:inline">AI Chat</span>
                <span className="@[80px]:hidden">AI</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tasks Tab Content */}
          <TabsContent
            value="tasks"
            className="m-0 flex flex-1 flex-col space-y-4 p-4"
          >
            {/* Board Summary Card */}
            {selectedBoard && (
              <div className="rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">Board Progress</h3>
                  <Badge variant="outline" className="text-xs">
                    {completedTasks}/{totalTasks}
                  </Badge>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/50">
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-300"
                    style={{
                      width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {totalTasks === 0
                    ? 'No tasks yet'
                    : completedTasks === totalTasks
                      ? 'All tasks completed!'
                      : `${totalTasks - completedTasks} tasks remaining`}
                </p>
              </div>
            )}

            {/* Board Selector */}
            <Popover
              open={boardSelectorOpen}
              onOpenChange={setBoardSelectorOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={boardSelectorOpen}
                  aria-label="Select a task board"
                  className="w-full justify-start truncate hover:bg-accent/50"
                >
                  <LayoutDashboard className="mr-2 h-4 w-4 flex-none" />
                  <span className="truncate">
                    {selectedBoard
                      ? selectedBoard.name
                      : initialTaskBoards.length > 0
                        ? 'Select a board'
                        : 'No boards found'}
                  </span>
                  <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search board..." />
                  <CommandEmpty>No board found.</CommandEmpty>
                  <CommandList className="max-h-60">
                    {initialTaskBoards.map((board) => (
                      <CommandItem
                        key={board.id}
                        value={board?.name ?? ''}
                        onSelect={() => {
                          setSelectedBoardId(board?.id ?? null);
                          setBoardSelectorOpen(false);
                          setOpenAccordions([]);
                        }}
                      >
                        <LayoutDashboard
                          className={cn(
                            'mr-2 h-4 w-4',
                            selectedBoardId === board.id
                              ? 'opacity-100'
                              : 'opacity-60'
                          )}
                        />
                        <span className="truncate">{board.name}</span>
                      </CommandItem>
                    ))}
                  </CommandList>
                  <CommandSeparator />
                  <DialogTrigger asChild>
                    <CommandItem
                      onSelect={() => {
                        setBoardSelectorOpen(false);
                        setIsAddBoardDialogOpen(true);
                      }}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" /> Create New Board
                    </CommandItem>
                  </DialogTrigger>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Board Management */}
            <Dialog
              open={isAddBoardDialogOpen}
              onOpenChange={setIsAddBoardDialogOpen}
            >
              {initialTaskBoards.length === 0 && !selectedBoardId && (
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <Plus className="mr-2 h-4 w-4" /> Add First Board
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Task Board</DialogTitle>
                </DialogHeader>
                <TaskBoardForm
                  wsId={wsId}
                  onFinish={(createdBoardData) =>
                    handleBoardCreateSuccess(createdBoardData?.id)
                  }
                />
              </DialogContent>
            </Dialog>

            {/* Board Content */}
            {selectedBoard ? (
              <ScrollArea className="flex-1 pr-2">
                <div className="space-y-3">
                  <Dialog
                    open={addListDialogOpen[selectedBoard?.id ?? ''] || false}
                    onOpenChange={(isOpen) =>
                      setAddListDialogOpen((prev) => ({
                        ...prev,
                        [selectedBoard?.id ?? '']: isOpen,
                      }))
                    }
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full hover:bg-accent/50"
                      >
                        <ListPlus className="mr-2 h-3.5 w-3.5" />
                        Add List to "{selectedBoard.name}"
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>
                          Add List to "{selectedBoard.name}"
                        </DialogTitle>
                      </DialogHeader>
                      <TaskListForm
                        wsId={wsId}
                        boardId={selectedBoard?.id ?? ''}
                        onSuccess={() =>
                          handleListCreateSuccess(selectedBoard?.id ?? '')
                        }
                      />
                    </DialogContent>
                  </Dialog>

                  {selectedBoard?.lists?.length === 0 ? (
                    <div className="py-8 text-center">
                      <LayoutDashboard className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        No task lists in this board yet.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Create your first list to get started.
                      </p>
                    </div>
                  ) : (
                    <Accordion
                      type="multiple"
                      value={openAccordions}
                      onValueChange={setOpenAccordions}
                      className="space-y-2"
                    >
                      {selectedBoard?.lists?.map((list) => (
                        <AccordionItem
                          value={`list-${list?.id}`}
                          key={list?.id}
                          className="rounded-lg border border-border/60 bg-card/50 shadow-sm backdrop-blur-sm"
                        >
                          <AccordionTrigger className="flex w-full items-center justify-between rounded-t-lg px-4 py-3 text-sm font-medium hover:bg-accent/30 data-[state=open]:rounded-b-none data-[state=open]:border-b data-[state=open]:border-border/60">
                            <span
                              className="flex-grow truncate text-left"
                              title={list?.name ?? ''}
                            >
                              {list?.name ?? ''}
                            </span>
                            <div className="flex items-center space-x-2">
                              {list?.tasks && list.tasks.length > 0 && (
                                <div className="flex items-center space-x-1">
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  {/* <span className="text-xs text-muted-foreground">
                                    {
                                      list.tasks.filter(
                                        (task) =>
                                          task.status?.toLowerCase() === 'done'
                                      ).length
                                    }
                                  </span> */}
                                </div>
                              )}
                              <Badge variant="secondary" className="text-xs">
                                {listCounts?.[list?.id ?? ''] || 0}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pt-1 pb-3">
                            <Dialog
                              open={addTaskDialogOpen[list?.id ?? ''] || false}
                              onOpenChange={(isOpen) =>
                                setAddTaskDialogOpen((prev) => ({
                                  ...prev,
                                  [list?.id ?? '']: isOpen,
                                }))
                              }
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mb-2 w-full justify-start text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                >
                                  <FilePlus2 className="mr-2 h-3 w-3" /> Add New
                                  Task
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    Add Task to "{list.name}"
                                  </DialogTitle>
                                </DialogHeader>
                                <TaskForm
                                  wsId={wsId}
                                  boardId={selectedBoard?.id ?? ''}
                                  listId={list?.id ?? ''}
                                  onSuccess={() =>
                                    handleTaskCreateSuccess(list?.id ?? '')
                                  }
                                />
                              </DialogContent>
                            </Dialog>

                            {list?.tasks?.length === 0 ? (
                              <div className="py-4 text-center">
                                <FilePlus2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                                <p className="text-xs text-muted-foreground">
                                  No tasks in this list.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {list?.tasks?.map((task) => (
                                  <div
                                    key={task?.id ?? ''}
                                    className="group @container relative rounded-md border bg-background/50 p-3 transition-all hover:bg-accent/30 hover:shadow-sm @md:p-4"
                                  >
                                    <Link
                                      href={`/${wsId}/tasks/boards/${selectedBoard.id}?taskId=${task.id}`}
                                      className="block"
                                      title={task.description || task.name}
                                    >
                                      <div className="flex items-start justify-between">
                                        <div className="min-w-0 flex-1">
                                          <h4 className="truncate pr-2 text-sm font-medium @md:text-base">
                                            {task.name}
                                          </h4>
                                          {task.description && (
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground @md:text-sm">
                                              {task.description}
                                            </p>
                                          )}
                                        </div>
                                        <div className="ml-2 flex shrink-0 items-center space-x-1.5">
                                          <QuickTaskTimer
                                            wsId={wsId}
                                            task={task}
                                            size="xs"
                                          />
                                          {/* {task.priority && (
                                            <PriorityIcon
                                              priority={task.priority}
                                            />
                                          )}
                                          {task.status && (
                                            <StatusIcon status={task.status} />
                                          )} */}
                                        </div>
                                      </div>
                                      {task.end_date && (
                                        <div className="mt-2 flex items-center text-xs text-muted-foreground">
                                          <Clock className="mr-1 h-3 w-3" />
                                          Due:{' '}
                                          {new Date(
                                            task.end_date
                                          ).toLocaleDateString()}
                                        </div>
                                      )}
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </div>
              </ScrollArea>
            ) : (
              initialTaskBoards.length > 0 && (
                <div className="py-8 text-center">
                  <LayoutDashboard className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Select a board to view its tasks.
                  </p>
                </div>
              )
            )}
          </TabsContent>

          {/* AI Chat Tab Content */}
          {hasAiChatAccess && (
            <TabsContent value="ai-chat" className="m-0 px-2">
              <div className="relative h-[calc(100vh-11.5rem)] overflow-y-auto py-2">
                <Chat
                  wsId={wsId}
                  hasKeys={hasKeys}
                  chats={chats}
                  count={count}
                  locale={locale}
                  disableScrollToBottom
                  disableScrollToTop
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Dialog>
  );
}
