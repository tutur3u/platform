'use client';

import Chat from '../../chat/chat';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import ActionsDropdown from './actions-dropdown';
import PriorityDropdown from './priority-dropdown';
import TimeTracker from './time-tracker';
import type { AIChat } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  Bot,
  Calendar,
  CheckCircle2,
  LayoutDashboard,
  PanelLeftClose,
  PanelRightClose,
  Search,
  Timer,
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';

interface TasksSidebarContentProps {
  wsId: string;
  tasks?: ExtendedWorkspaceTask[]; // Accept tasks as a prop
  hasKeys?: { openAI: boolean; anthropic: boolean; google: boolean };
  chats?: AIChat[];
  count?: number | null;
  locale?: string;
  hasAiChatAccess?: boolean;
}

export default function TasksSidebarContent({
  wsId,
  tasks = [],
  hasKeys = { openAI: false, anthropic: false, google: false },
  chats = [],
  count = 0,
  locale = 'en',
  hasAiChatAccess = true,
}: TasksSidebarContentProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');

  if (isCollapsed) {
    return (
      <div className="ml-2 hidden h-full flex-col items-center rounded-lg border border-border bg-background/60 p-2 shadow-lg backdrop-blur-md transition-all duration-300 ease-in-out hover:bg-background/70 xl:flex">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          aria-label="Expand sidebar"
          className="group relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-105 hover:bg-accent/60"
        >
          <PanelLeftClose className="h-5 w-5 text-foreground transition-transform duration-200 group-hover:rotate-12" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog>
      <div className="@container ml-2 flex h-full max-h-[100vh] w-1/3 flex-col rounded-lg border border-border bg-background/60 text-foreground shadow-xl backdrop-blur-md transition-all duration-500 ease-out slide-in-from-right-5 xl:flex">
        {/* Header */}
        <div className="@container flex items-center justify-between rounded-t-lg border-b border-border/50 bg-gradient-to-r from-background/80 to-background/60 px-4 py-3 backdrop-blur-sm">
          <div className="flex w-full items-center justify-between gap-1">
            <div className="transition-all duration-300 hover:scale-105">
              <TimeTracker wsId={wsId} tasks={tasks} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(true)}
              aria-label="Collapse sidebar"
              className="group relative overflow-hidden rounded-lg transition-all duration-200 hover:scale-105 hover:bg-accent/60"
            >
              <PanelRightClose className="h-5 w-5 text-foreground transition-transform duration-200 group-hover:-rotate-12" />
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-red-500/20 to-orange-500/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </Button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border/50 bg-muted/10 p-2">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0">
              <TabsTrigger
                value="tasks"
                className="group @container relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <LayoutDashboard className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                <span className="hidden transition-all duration-200 @[80px]:inline">
                  Tasks
                </span>
                <span className="transition-all duration-200 @[80px]:hidden">
                  T
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="ai-chat"
                className="group @container relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <Bot className="h-4 w-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                <span className="hidden transition-all duration-200 @[80px]:inline">
                  AI Chat
                </span>
                <span className="transition-all duration-200 @[80px]:hidden">
                  AI
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tasks Tab Content */}
          <TabsContent
            value="tasks"
            className="m-0 flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-4 pb-2 duration-300 animate-in fade-in-50"
          >
            <div className="mx-auto w-full max-w-lg p-0">
              <PriorityView allTasks={tasks} />
            </div>
          </TabsContent>

          {/* AI Chat Tab Content */}
          {hasAiChatAccess && (
            <TabsContent
              value="ai-chat"
              className="m-0 min-h-0 flex-1 overflow-y-auto px-2 duration-300 animate-in fade-in-50"
            >
              <div className="relative h-full min-h-0 overflow-y-auto py-2">
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

// Add PriorityView component for the new tab
function PriorityView({ allTasks }: { allTasks: ExtendedWorkspaceTask[] }) {
  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const PRIORITY_LABELS = {
    low: 'Low priority',
    normal: 'Normal priority',
    high: 'High priority',
    critical: 'Critical',
  };

  const PRIORITY_COLORS = {
    low: 'from-green-500/20 to-green-600/20 border-green-200 dark:border-green-800',
    normal:
      'from-blue-500/20 to-blue-600/20 border-blue-200 dark:border-blue-800',
    high: 'from-orange-500/20 to-orange-600/20 border-orange-200 dark:border-orange-800',
    critical:
      'from-red-500/20 to-red-600/20 border-red-200 dark:border-red-800',
  };

  const PRIORITY_ICONS = {
    low: '😊',
    normal: '😐',
    high: '😠',
    critical: '😡',
  };

  // Group tasks by priority
  const grouped: { [key: string]: ExtendedWorkspaceTask[] } = {
    low: [],
    normal: [],
    high: [],
    critical: [],
  };

  allTasks?.forEach((task) => {
    const priority = task.user_defined_priority || 'normal';
    if (grouped[priority]) {
      grouped[priority].push(task);
    } else {
      grouped.normal?.push(task);
    }
  });

  // Filter by search
  const filteredGrouped = Object.fromEntries(
    Object.entries(grouped).map(([key, tasks]) => [
      key,
      tasks.filter((task) =>
        search
          ? task.name?.toLowerCase().includes(search.toLowerCase()) ||
            task.description?.toLowerCase().includes(search.toLowerCase())
          : true
      ),
    ])
  );

  const handlePriorityChange = async (taskId: string, newPriority: string) => {
    // TODO: Implement API call to update task priority
    console.log('Updating task priority:', taskId, newPriority);
    // This would typically make an API call to update the task
    // await updateTaskPriority(taskId, newPriority);
  };

  const handleEdit = (taskId: string) => {
    // TODO: Implement edit functionality
    console.log('Editing task:', taskId);
  };

  const handleViewDetails = (taskId: string) => {
    // TODO: Implement view details functionality
    console.log('Viewing details for task:', taskId);
  };

  const handleDueDate = (taskId: string) => {
    // TODO: Implement due date functionality
    console.log('Setting due date for task:', taskId);
  };

  const handleAddTime = (taskId: string) => {
    // TODO: Implement add time functionality
    console.log('Adding time to task:', taskId);
  };

  const handleLogWork = (taskId: string) => {
    // TODO: Implement log work functionality
    console.log('Logging work for task:', taskId);
  };

  const handleMarkDone = (taskId: string) => {
    // TODO: Implement mark done functionality
    console.log('Marking task as done:', taskId);
  };

  const handleDelete = (taskId: string) => {
    // TODO: Implement delete functionality
    console.log('Deleting task:', taskId);
  };

  return (
    <div className="space-y-4">
      {/* Enhanced Search */}
      <div className="relative mb-6" style={{ marginLeft: '-1rem' }}>
        <div
          className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${
            isSearchFocused
              ? 'border-blue-400 bg-background shadow-lg ring-2 ring-blue-400/20'
              : 'border-border bg-background/50 hover:bg-background/80'
          }`}
        >
          <div className="flex items-center">
            <Search
              className={`ml-3 h-4 w-4 transition-colors duration-200 ${
                isSearchFocused ? 'text-blue-500' : 'text-muted-foreground'
              }`}
            />
            <input
              className="w-full bg-transparent px-3 py-3 text-sm placeholder-muted-foreground outline-none"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </div>
          {isSearchFocused && (
            <div className="absolute inset-0 -z-10 animate-pulse bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
          )}
        </div>
      </div>

      {/* Priority Groups */}
      <div className="space-y-4">
        {Object.entries(PRIORITY_LABELS).map(([key, label], index) => {
          const tasks = filteredGrouped[key] || [];
          const colorClasses =
            PRIORITY_COLORS[key as keyof typeof PRIORITY_COLORS];
          const icon = PRIORITY_ICONS[key as keyof typeof PRIORITY_ICONS];

          return (
            <div
              key={key}
              className="group duration-300 animate-in slide-in-from-bottom-2"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <h3 className="font-semibold text-foreground">{label}</h3>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground transition-colors duration-200 group-hover:bg-accent">
                  {tasks.length}
                </span>
              </div>

              {tasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/50 p-6 text-center transition-all duration-200 hover:border-border">
                  <div className="text-sm text-muted-foreground">
                    No tasks found
                  </div>
                </div>
              ) : (
                <div
                  className={`overflow-hidden rounded-xl border bg-gradient-to-br ${colorClasses} shadow-sm transition-all duration-300 hover:shadow-md`}
                >
                  <div className="bg-background/80 p-4 backdrop-blur-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold">Tasks</div>
                      <Timer className="h-4 w-4 text-muted-foreground" />
                    </div>

                    <div className="space-y-2">
                      {tasks.map((task, taskIndex) => (
                        <div
                          key={task.id}
                          className="group/task relative overflow-hidden rounded-lg border border-border/50 bg-background/60 p-3 transition-all duration-200 hover:border-border hover:bg-background/80 hover:shadow-sm"
                          style={{ animationDelay: `${taskIndex * 50}ms` }}
                        >
                          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-accent/5 to-accent/10 opacity-0 transition-opacity duration-200 group-hover/task:opacity-100" />
                          <div className="flex h-full min-h-[64px] flex-col">
                            <div className="flex w-full items-start justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-foreground transition-colors duration-200 group-hover/task:text-blue-600">
                                  {task.name || (
                                    <span className="text-muted-foreground italic">
                                      Untitled task
                                    </span>
                                  )}
                                </div>
                                {/* Due date (if present) */}
                                {task.due_date && (
                                  <div className="mt-1 inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                    <Calendar className="h-3 w-3" />
                                    Due {formatDueDate(task.due_date)}
                                  </div>
                                )}
                              </div>
                              {/* Top right icons */}
                              <div className="ml-3 flex items-center gap-2">
                                <PriorityDropdown
                                  taskId={task.id}
                                  currentPriority={
                                    task.user_defined_priority as string
                                  }
                                  onPriorityChange={handlePriorityChange}
                                />
                                <ActionsDropdown
                                  taskId={task.id}
                                  onEdit={handleEdit}
                                  onViewDetails={handleViewDetails}
                                  onDueDate={handleDueDate}
                                  onAddTime={handleAddTime}
                                  onLogWork={handleLogWork}
                                  onMarkDone={handleMarkDone}
                                  onDelete={handleDelete}
                                />
                              </div>
                            </div>
                            {/* Bottom row: Ready left, time right */}
                            <div className="mt-2 flex items-center justify-between">
                              <div className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                Ready
                              </div>
                              {task.total_duration && (
                                <div className="rounded-md bg-accent/50 px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 group-hover/task:bg-accent">
                                  {Math.floor(task.total_duration || 0)}h{' '}
                                  {((task.total_duration || 0) * 60) % 60}m
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDueDate(date: string | Date) {
  // expects date as string or Date, returns MM/DD or DD/MM as you prefer
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
