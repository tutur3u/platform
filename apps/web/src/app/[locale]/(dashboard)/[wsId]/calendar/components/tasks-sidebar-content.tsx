'use client';

import Chat from '../../chat/chat';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import PriorityView from './priority-view';
import TimeTracker from './time-tracker';
import type { AIChat } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Dialog } from '@tuturuuu/ui/dialog';
import {
  Bot,
  LayoutDashboard,
  PanelLeftClose,
  PanelRightClose,
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useState } from 'react';

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
              <PriorityView allTasks={tasks} assigneeId={assigneeId} />
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
