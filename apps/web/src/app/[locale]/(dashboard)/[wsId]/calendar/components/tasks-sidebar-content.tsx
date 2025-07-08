'use client';

import type {
  AIChat,
  // WorkspaceTask,
  // WorkspaceTaskBoard,
} from '@tuturuuu/types/db';
// import {
//   Accordion,
//   AccordionContent,
//   AccordionItem,
//   AccordionTrigger,
// } from '@tuturuuu/ui/accordion';
// import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
// import {
//   Command,
//   CommandEmpty,
//   CommandInput,
//   CommandItem,
//   CommandList,
//   CommandSeparator,
// } from '@tuturuuu/ui/command';
import {
  Dialog,
  // DialogContent,
  // DialogHeader,
  // DialogTitle,
  // DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Bot,
  // CheckCircle2,
  // ChevronDown,
  // Clock,
  // FilePlus2,
  LayoutDashboard,
  // ListPlus,
  PanelLeftClose,
  PanelRightClose,
  // Plus,
  // PlusCircle,
} from '@tuturuuu/ui/icons';
// import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
// import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
// import { cn } from '@tuturuuu/utils/format';
// import Link from 'next/link';
// import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Chat from '../../chat/chat';
// import { TaskBoardForm } from '../../tasks/boards/form';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
// import QuickTaskTimer from './quick-task-timer';
// import { TaskForm } from './task-form';
// import { TaskListForm } from './task-list-form';
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
            <TimeTracker wsId={wsId} tasks={tasks} />
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
                <span className="@[80px]:inline hidden">Tasks</span>
                <span className="@[80px]:hidden">T</span>
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
            <div className="mx-auto max-w-lg p-2">
              <PriorityView allTasks={tasks} />
            </div>
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

// Add PriorityView component for the new tab
function PriorityView({ allTasks }: { allTasks: ExtendedWorkspaceTask[] }) {
  const [search, setSearch] = useState('');
  const PRIORITY_LABELS = {
    critical: 'Critical',
    high: 'High priority',
    medium: 'Medium priority',
    low: 'Low priority',
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
      // Fallback to 'low' priority if the priority is not recognized
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
    <>
      <div
        className="mb-4 flex items-center justify-start"
        style={{ marginLeft: '-1rem' }}
      >
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Search task..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 180, marginLeft: 0 }}
        />
        <button type="button" className="ml-2 p-2">
          <span role="img" aria-label="filter">
            🔍
          </span>
        </button>
      </div>
      {/* Priority Groups */}
      {Object.entries(PRIORITY_LABELS).map(([key, label]) => {
        const tasks = filteredGrouped[key] || [];
        return (
          <div key={key} className="mb-4">
            <div className="mb-2 font-semibold text-gray-700 dark:text-gray-200">
              {label}
            </div>
            {tasks.length === 0 ? (
              <div className="text-gray-400 text-xs">No items</div>
            ) : (
              <div className="rounded bg-white p-3 shadow dark:bg-zinc-900">
                <div className="mb-2 font-bold">
                  Tasks{' '}
                  <span className="text-gray-400 text-xs">{tasks.length}</span>
                </div>
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center border-zinc-100 border-b py-2 last:border-b-0 dark:border-zinc-800"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        {task.name || (
                          <span className="text-gray-400 italic">No name</span>
                        )}
                      </div>
                      <div className="mb-1 text-green-600 text-xs">
                        Done scheduling
                      </div>
                    </div>
                    <div className="ml-2 text-gray-500 text-xs">
                      {task.total_duration
                        ? `${Math.floor((task.total_duration || 0) / 60)} hrs ${(task.total_duration || 0) % 60} mins`
                        : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
