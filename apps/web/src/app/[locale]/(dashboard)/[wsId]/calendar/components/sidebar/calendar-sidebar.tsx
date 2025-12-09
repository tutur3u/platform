'use client';

import {
  CalendarClock,
  LayoutDashboard,
  PanelLeftClose,
  PanelRightClose,
  Repeat,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';
import type { ExtendedWorkspaceTask } from '../../../time-tracker/types';
import { HabitsPanel } from '../habits-panel';
import PriorityView from '../priority-view';
import { TaskSchedulerPanel } from '../task-scheduler-panel';
import TimeTracker from '../time-tracker';

const SIDEBAR_COLLAPSED_KEY = 'calendar-sidebar-collapsed';

type SidebarTab = 'tasks' | 'habits' | 'schedule';

interface CalendarSidebarProps {
  wsId: string;
  assigneeId: string;
  tasks?: ExtendedWorkspaceTask[];
  locale?: string;
  onEventCreated?: () => void;
  /** If true, skip auto-assignment when creating tasks (personal workspace) */
  isPersonalWorkspace?: boolean;
}

const SIDEBAR_TABS: Array<{
  id: SidebarTab;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}> = [
  {
    id: 'tasks',
    label: 'Tasks',
    shortLabel: 'T',
    icon: LayoutDashboard,
  },
  {
    id: 'habits',
    label: 'Habits',
    shortLabel: 'H',
    icon: Repeat,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    shortLabel: 'S',
    icon: CalendarClock,
  },
];

export function CalendarSidebar({
  wsId,
  assigneeId,
  tasks = [],
  onEventCreated,
  isPersonalWorkspace = false,
}: CalendarSidebarProps) {
  // Load collapsed state from localStorage, default to true (collapsed)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === null ? true : saved === 'true';
  });
  const [activeTab, setActiveTab] = useState<SidebarTab>('tasks');

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  // Collapsed state - show only expand button
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
          <PanelLeftClose className="h-5 w-5 text-foreground transition-colors duration-200" />
        </Button>
      </div>
    );
  }

  return (
    <div className="@container ml-2 hidden h-full w-80 shrink-0 flex-col rounded-lg border border-border bg-background/60 shadow-xl backdrop-blur-md xl:flex">
      {/* Header with TimeTracker and Collapse Button */}
      <div className="flex flex-row items-center justify-between border-b border-border/50 bg-background/80 p-3 backdrop-blur-sm">
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
          <PanelRightClose className="h-5 w-5 text-foreground transition-colors duration-200" />
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border/50 bg-muted/10 p-2">
        <div className="flex flex-row gap-1">
          {SIDEBAR_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 py-2 text-sm transition-all duration-200',
                activeTab === tab.id
                  ? 'border-border/50 bg-background font-medium shadow-md'
                  : 'text-muted-foreground hover:border-border/50 hover:bg-accent/60 hover:text-foreground'
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden @[200px]:inline">{tab.label}</span>
              <span className="@[200px]:hidden">{tab.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'tasks' && (
          <ScrollArea className="h-full">
            <div className="fade-in-50 animate-in p-2 duration-300">
              <PriorityView
                wsId={wsId}
                allTasks={tasks}
                assigneeId={assigneeId}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            </div>
          </ScrollArea>
        )}

        {activeTab === 'habits' && (
          <div className="fade-in-50 h-full animate-in overflow-hidden duration-300">
            <HabitsPanel wsId={wsId} onEventCreated={onEventCreated} />
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="fade-in-50 h-full animate-in overflow-hidden duration-300">
            <TaskSchedulerPanel
              wsId={wsId}
              userId={assigneeId}
              onEventCreated={onEventCreated}
            />
          </div>
        )}
      </div>
    </div>
  );
}
