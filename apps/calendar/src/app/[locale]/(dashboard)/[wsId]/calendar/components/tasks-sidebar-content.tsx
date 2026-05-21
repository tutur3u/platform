'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CalendarClock,
  LayoutDashboard,
  PanelLeftClose,
  PanelRightClose,
  Repeat,
} from '@tuturuuu/icons';
import type { AIChat } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Dialog } from '@tuturuuu/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';
import Chat from '../../ai-chat/chat';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import { HabitsPanel } from './habits-panel';
import PriorityView from './priority-view';
import { TaskSchedulerPanel } from './task-scheduler-panel';
import TimeTracker from './time-tracker';

interface TasksSidebarContentProps {
  wsId: string;
  assigneeId: string;
  tasks?: ExtendedWorkspaceTask[]; // Accept tasks as a prop
  hasKeys?: { openAI: boolean; anthropic: boolean; google: boolean };
  chats?: AIChat[];
  count?: number | null;
  locale?: string;
  hasAiChatAccess?: boolean;
}

export default function TasksSidebarContent({
  wsId,
  assigneeId,
  tasks = [],
  hasKeys = { openAI: false, anthropic: false, google: false },
  chats = [],
  count = 0,
  locale = 'en',
  hasAiChatAccess = true,
}: TasksSidebarContentProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState('tasks');
  const queryClient = useQueryClient();

  const handleEventCreated = () => {
    // Invalidate calendar events query to refresh the calendar
    queryClient.invalidateQueries({ queryKey: ['calendarEvents', wsId] });
  };

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
          <PanelLeftClose className="h-5 w-5 text-foreground transition-transform duration-200" />
          <div className="absolute inset-0 -z-10 bg-linear-to-r from-dynamic-blue/20 to-dynamic-purple/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </Button>
      </div>
    );
  }

  return (
    <Dialog>
      <div className="@container slide-in-from-right-5 ml-2 flex h-full max-h-screen w-1/3 flex-col rounded-lg border border-border bg-background/60 text-foreground shadow-xl backdrop-blur-md transition-all duration-500 ease-out xl:flex">
        {/* Header */}
        <div className="@container flex items-center justify-between rounded-t-lg border-border/50 border-b bg-linear-to-r from-background/80 to-background/60 px-4 py-3 backdrop-blur-sm">
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
              <PanelRightClose className="h-5 w-5 text-foreground transition-transform duration-200" />
              <div className="absolute inset-0 -z-10 bg-linear-to-r from-dynamic-red/20 to-dynamic-orange/20 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </Button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-border/50 border-b bg-muted/10 p-2">
            <TabsList className="grid h-auto w-full grid-cols-4 gap-2 bg-transparent p-0">
              <TabsTrigger
                value="tasks"
                className="group @container relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="absolute inset-0 -z-10 bg-linear-to-r from-dynamic-blue/10 to-dynamic-cyan/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <LayoutDashboard className="h-4 w-4 transition-colors duration-200" />
                <span className="@[80px]:inline hidden transition-all duration-200">
                  Tasks
                </span>
                <span className="@[80px]:hidden transition-all duration-200">
                  T
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="habits"
                className="group @container relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="absolute inset-0 -z-10 bg-linear-to-r from-dynamic-orange/10 to-dynamic-yellow/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <Repeat className="h-4 w-4 transition-colors duration-200" />
                <span className="@[80px]:inline hidden transition-all duration-200">
                  Habits
                </span>
                <span className="@[80px]:hidden transition-all duration-200">
                  H
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="schedule"
                className="group @container relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="absolute inset-0 -z-10 bg-linear-to-r from-dynamic-green/10 to-dynamic-green/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <CalendarClock className="h-4 w-4 transition-colors duration-200" />
                <span className="@[80px]:inline hidden transition-all duration-200">
                  Schedule
                </span>
                <span className="@[80px]:hidden transition-all duration-200">
                  S
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="ai-chat"
                className="group @container relative overflow-hidden rounded-lg border border-transparent transition-all duration-300 hover:border-border/50 hover:bg-accent/60 data-[state=active]:border-border/50 data-[state=active]:bg-background data-[state=active]:shadow-md"
              >
                <div className="absolute inset-0 -z-10 bg-linear-to-r from-dynamic-purple/10 to-dynamic-pink/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <Bot className="h-4 w-4 transition-colors duration-200" />
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
            className="fade-in-50 m-0 flex min-h-0 flex-1 animate-in flex-col space-y-4 overflow-y-auto p-4 pb-2 duration-300"
          >
            <div className="mx-auto w-full max-w-lg p-0">
              <PriorityView
                wsId={wsId}
                allTasks={tasks}
                assigneeId={assigneeId}
              />
            </div>
          </TabsContent>

          {/* Habits Tab Content */}
          <TabsContent
            value="habits"
            className="fade-in-50 m-0 min-h-0 flex-1 animate-in overflow-hidden duration-300"
          >
            <HabitsPanel wsId={wsId} onEventCreated={handleEventCreated} />
          </TabsContent>

          {/* Schedule Tab Content */}
          <TabsContent
            value="schedule"
            className="fade-in-50 m-0 min-h-0 flex-1 animate-in overflow-hidden duration-300"
          >
            <TaskSchedulerPanel
              wsId={wsId}
              userId={assigneeId}
              onEventCreated={handleEventCreated}
            />
          </TabsContent>

          {/* AI Chat Tab Content */}
          {hasAiChatAccess && (
            <TabsContent
              value="ai-chat"
              className="fade-in-50 m-0 min-h-0 flex-1 animate-in overflow-y-auto px-2 duration-300"
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
