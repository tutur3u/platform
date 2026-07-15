'use client';

import {
  LayoutDashboard,
  PanelLeftClose,
  PanelRightClose,
  Repeat,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useEffect, useState } from 'react';
import { HabitsPanel } from '../habits-panel';
import PriorityView from '../priority-view';
import TimeTracker from '../time-tracker';

const SIDEBAR_COLLAPSED_KEY = 'calendar-sidebar-collapsed';

interface CalendarSidebarProps {
  wsId: string;
  assigneeId: string;
  tasks?: ExtendedWorkspaceTask[];
  locale?: string;
  onEventCreated?: () => void;
  /** If true, skip auto-assignment when creating tasks (personal workspace) */
  isPersonalWorkspace?: boolean;
}

export function CalendarSidebar({
  wsId,
  assigneeId,
  tasks = [],
  onEventCreated,
  isPersonalWorkspace = false,
}: CalendarSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === null ? true : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  if (isCollapsed) {
    return (
      <div className="ml-2 hidden h-full flex-col items-center rounded-lg border border-border/40 bg-background/80 p-2 backdrop-blur-xl transition-all duration-300 xl:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(false)}
              aria-label="Expand sidebar"
              className="h-8 w-8 rounded-lg text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Expand sidebar</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="ml-2 hidden h-full w-80 shrink-0 flex-col rounded-lg border border-border/40 bg-background/80 backdrop-blur-xl xl:flex">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <TimeTracker wsId={wsId} tasks={tasks} />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse sidebar"
          className="h-8 w-8 rounded-lg text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-border/60" />

      {/* Scrollable Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {/* Tasks Section */}
          <div className="px-3 pt-3 pb-1">
            <div className="mb-2 flex items-center gap-2">
              <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Tasks
              </span>
              {tasks.length > 0 && (
                <span className="rounded-full bg-foreground/10 px-1.5 py-px font-medium text-[10px] text-foreground/60">
                  {tasks.length}
                </span>
              )}
            </div>
            <PriorityView
              wsId={wsId}
              allTasks={tasks}
              assigneeId={assigneeId}
              isPersonalWorkspace={isPersonalWorkspace}
            />
          </div>

          {/* Section Divider */}
          <div className="mx-3 my-2 h-px bg-border/60" />

          {/* Habits Section */}
          <div className="px-3 pt-1 pb-3">
            <div className="mb-2 flex items-center gap-2">
              <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                Habits
              </span>
            </div>
            <HabitsPanel wsId={wsId} onEventCreated={onEventCreated} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
