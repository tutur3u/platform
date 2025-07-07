'use client';

import type { AIChat } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  PanelLeftClose,
  PanelRightClose,
  Search,
  Timer,
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import Chat from '../../chat/chat';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import TimeTracker from './time-tracker';

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
  console.log('Sidebar tasks:', tasks);
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
          <div className="-z-10 absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog>
      <div className="@container slide-in-from-right-5 ml-2 hidden h-full w-1/3 animate-in flex-col rounded-lg border border-border bg-background/60 text-foreground shadow-xl backdrop-blur-md transition-all duration-500 ease-out xl:flex">
        {/* Header */}
        <div className="@container flex items-center justify-between rounded-t-lg border-border/50 border-b bg-gradient-to-r from-background/80 to-background/60 px-4 py-3 backdrop-blur-sm">
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
              <PanelRightClose className="group-hover:-rotate-12 h-5 w-5 text-foreground transition-transform duration-200" />
              <div className="-z-10 absolute inset-0 bg-gradient-to-r from-red-500/20 to-orange-500/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </Button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col gap-0"
        >
          <div className="border-border/50 border-b bg-muted/10 p-2">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0">
              <TabsTrigger
                value="tasks"
                className="@container group relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="-z-10 absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <LayoutDashboard className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                <span className="@[80px]:inline hidden transition-all duration-200">
                  Tasks
                </span>
                <span className="@[80px]:hidden transition-all duration-200">
                  T
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="ai-chat"
                className="@container group relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="-z-10 absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <Bot className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />
                <span className="@[80px]:inline hidden transition-all duration-200">
                  AI Chat
                </span>
                <span className="@[80px]:hidden transition-all duration-200">
                  AI
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tasks Tab Content */}
          <TabsContent
            value="tasks"
            className="fade-in-50 m-0 flex flex-1 animate-in flex-col space-y-4 p-4 duration-300"
          >
            <div className="mx-auto max-w-lg p-2">
              <PriorityView allTasks={tasks} />
            </div>
          </TabsContent>

          {/* AI Chat Tab Content */}
          {hasAiChatAccess && (
            <TabsContent
              value="ai-chat"
              className="fade-in-50 m-0 animate-in px-2 duration-300"
            >
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

// Add PriorityView component for the new tab
function PriorityView({ allTasks }: { allTasks: ExtendedWorkspaceTask[] }) {
  const [search, setSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const PRIORITY_LABELS = {
    critical: 'Critical',
    high: 'High priority',
    medium: 'Medium priority',
    low: 'Low priority',
  };

  const PRIORITY_COLORS = {
    critical:
      'from-red-500/20 to-red-600/20 border-red-200 dark:border-red-800',
    high: 'from-orange-500/20 to-orange-600/20 border-orange-200 dark:border-orange-800',
    medium:
      'from-yellow-500/20 to-yellow-600/20 border-yellow-200 dark:border-yellow-800',
    low: 'from-green-500/20 to-green-600/20 border-green-200 dark:border-green-800',
  };

  const PRIORITY_ICONS = {
    critical: <AlertCircle className="h-4 w-4 text-red-500" />,
    high: <AlertCircle className="h-4 w-4 text-orange-500" />,
    medium: <Clock className="h-4 w-4 text-yellow-500" />,
    low: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  };

  // Group tasks by priority
  const grouped: { [key: string]: ExtendedWorkspaceTask[] } = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  allTasks?.forEach((task) => {
    const p = (task.user_defined_priority || 'low').toLowerCase();
    if (grouped[p]) {
      grouped[p].push(task);
    } else {
      grouped.low?.push(task);
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
            <div className="-z-10 absolute inset-0 animate-pulse bg-gradient-to-r from-blue-500/5 to-purple-500/5" />
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
              className="group slide-in-from-bottom-2 animate-in duration-300"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="mb-3 flex items-center gap-2">
                {icon}
                <h3 className="font-semibold text-foreground">{label}</h3>
                <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs transition-colors duration-200 group-hover:bg-accent">
                  {tasks.length}
                </span>
              </div>

              {tasks.length === 0 ? (
                <div className="rounded-lg border border-border/50 border-dashed p-6 text-center transition-all duration-200 hover:border-border">
                  <div className="text-muted-foreground text-sm">
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
                          <div className="-z-10 absolute inset-0 bg-gradient-to-r from-accent/5 to-accent/10 opacity-0 transition-opacity duration-200 group-hover/task:opacity-100" />

                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium text-foreground transition-colors duration-200 group-hover/task:text-blue-600">
                                {task.name || (
                                  <span className="text-muted-foreground italic">
                                    Untitled task
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2">
                                <div className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-green-700 text-xs dark:bg-green-900/30 dark:text-green-400">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Ready
                                </div>
                              </div>
                            </div>

                            {task.total_duration && (
                              <div className="ml-3 rounded-md bg-accent/50 px-2 py-1 font-mono text-muted-foreground text-xs transition-colors duration-200 group-hover/task:bg-accent">
                                {Math.floor((task.total_duration || 0) / 60)}h{' '}
                                {(task.total_duration || 0) % 60}m
                              </div>
                            )}
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
