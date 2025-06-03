'use client';

import Chat from '../../chat/chat';
import { TaskBoardForm } from '../../tasks/boards/form';
import QuickTaskTimer from './quick-task-timer';
import { TaskForm } from './task-form';
import { TaskListForm } from './task-list-form';
import TimeTracker from './time-tracker';
import type {
  AIChat,
  WorkspaceTask,
  WorkspaceTaskBoard,
} from '@ncthub/types/db';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ncthub/ui/accordion';
import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@ncthub/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
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
} from '@ncthub/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@ncthub/ui/popover';
import { ScrollArea } from '@ncthub/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ncthub/ui/tabs';
import { cn } from '@ncthub/utils/format';
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
  const [isCollapsed, setIsCollapsed] = useState(false);
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
    const tasks: Partial<WorkspaceTask>[] = [];
    initialTaskBoards.forEach((board) => {
      board.lists?.forEach((list) => {
        if (list.tasks) {
          tasks.push(...list.tasks);
        }
      });
    });
    return tasks;
  }, [initialTaskBoards]);

  if (isCollapsed) {
    return (
      <div className="border-border bg-background/50 ml-2 flex h-full flex-col items-center rounded-lg border p-2 shadow-sm backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          aria-label="Expand sidebar"
          className="hover:bg-accent/50"
        >
          <PanelLeftClose className="text-foreground h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog>
      <div className="@container border-border bg-background/80 text-foreground ml-2 hidden h-full w-1/3 flex-col rounded-lg border shadow-lg backdrop-blur-sm xl:flex">
        {/* Header */}
        <div className="@container bg-muted/30 flex items-center justify-between rounded-t-lg border-b px-4 py-3">
          <div className="flex w-full items-center justify-between gap-1">
            <TimeTracker wsId={wsId} tasks={allTasks} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              aria-label="Collapse sidebar"
              className="hover:bg-accent/50"
            >
              <PanelRightClose className="text-foreground h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col gap-0"
        >
          <div className="bg-muted/20 border-b p-2">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0">
              <TabsTrigger value="tasks" className="@container">
                <LayoutDashboard className="h-4 w-4" />
                <span className="@[80px]:inline hidden">Tasks</span>
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
                <span className="@[80px]:inline hidden">AI Chat</span>
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
              <div className="border-primary/20 from-primary/10 to-primary/5 rounded-lg border bg-gradient-to-r p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">Board Progress</h3>
                  <Badge variant="outline" className="text-xs">
                    {completedTasks}/{totalTasks}
                  </Badge>
                </div>
                <div className="bg-muted/50 h-2 w-full rounded-full">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
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
                  className="hover:bg-accent/50 w-full justify-start truncate"
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
                        className="hover:bg-accent/50 w-full"
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
                      <LayoutDashboard className="text-muted-foreground mx-auto mb-3 h-12 w-12" />
                      <p className="text-muted-foreground text-sm">
                        No task lists in this board yet.
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
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
                          className="border-border/60 bg-card/50 rounded-lg border shadow-sm backdrop-blur-sm"
                        >
                          <AccordionTrigger className="hover:bg-accent/30 data-[state=open]:border-border/60 flex w-full items-center justify-between rounded-t-lg px-4 py-3 text-sm font-medium data-[state=open]:rounded-b-none data-[state=open]:border-b">
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
                          <AccordionContent className="px-3 pb-3 pt-1">
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
                                  className="text-muted-foreground hover:bg-accent/50 hover:text-foreground mb-2 w-full justify-start"
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
                                <FilePlus2 className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                                <p className="text-muted-foreground text-xs">
                                  No tasks in this list.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {list?.tasks?.map((task) => (
                                  <div
                                    key={task?.id ?? ''}
                                    className="@container bg-background/50 hover:bg-accent/30 @md:p-4 group relative rounded-md border p-3 transition-all hover:shadow-sm"
                                  >
                                    <Link
                                      href={`/${wsId}/tasks/boards/${selectedBoard.id}?taskId=${task.id}`}
                                      className="block"
                                      title={task.description || task.name}
                                    >
                                      <div className="flex items-start justify-between">
                                        <div className="min-w-0 flex-1">
                                          <h4 className="@md:text-base truncate pr-2 text-sm font-medium">
                                            {task.name}
                                          </h4>
                                          {task.description && (
                                            <p className="text-muted-foreground @md:text-sm mt-1 line-clamp-2 text-xs">
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
                                        <div className="text-muted-foreground mt-2 flex items-center text-xs">
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
                  <LayoutDashboard className="text-muted-foreground mx-auto mb-3 h-12 w-12" />
                  <p className="text-muted-foreground text-sm">
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
