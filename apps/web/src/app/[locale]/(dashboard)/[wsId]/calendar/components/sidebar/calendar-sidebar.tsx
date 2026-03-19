'use client';

import {
  CheckSquare,
  LayoutDashboard,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Repeat,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import HabitFormDialog from '../../../tasks/habits/habit-form-dialog';
import type { ExtendedWorkspaceTask } from '../../../time-tracker/types';
import { useE2EE } from '../../hooks/use-e2ee';
import CalendarConnectionsUnified from '../calendar-connections-unified';
import { E2EEStatusBadge } from '../e2ee-status-badge';
import { HabitsPanel } from '../habits-panel';
import PriorityView from '../priority-view';
import { QuickTaskDialog } from '../quick-task-dialog';
import { TaskSchedulerPanel } from '../task-scheduler-panel';

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
  const t = useTranslations('calendar');
  const e2ee = useE2EE(wsId);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === null ? true : saved === 'true';
  });

  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [habitFormOpen, setHabitFormOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  if (isCollapsed) {
    return (
      <div className="-mt-4 -mr-4 -mb-8 ml-4 hidden h-screen flex-none flex-col items-center border-l bg-background/50 p-2 pt-3 xl:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(false)}
              aria-label="Expand sidebar"
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
    <div className="-mt-4 -mr-4 ml-4 hidden h-screen w-80 flex-none flex-col border-l bg-background/50 xl:flex">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 px-3 pt-3 pb-2">
        <div className="flex items-center gap-1">
          <E2EEStatusBadge
            status={e2ee.status}
            isLoading={e2ee.isLoading}
            isVerifying={e2ee.isVerifying}
            isFixing={e2ee.isFixing}
            isMigrating={e2ee.isMigrating}
            isEnabling={e2ee.isEnabling}
            fixProgress={e2ee.fixProgress}
            hasUnencryptedEvents={e2ee.hasUnencryptedEvents ?? false}
            onVerify={e2ee.verify}
            onMigrate={e2ee.migrate}
            onEnable={e2ee.enable}
          />
          {/*<TimeTracker wsId={wsId} tasks={tasks} />*/}
          <CalendarConnectionsUnified wsId={wsId} />
        </div>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('new')}>
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setQuickTaskOpen(true)}>
                <CheckSquare className="mr-2 h-4 w-4 text-dynamic-blue" />
                {t('new-task')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHabitFormOpen(true)}>
                <Repeat className="mr-2 h-4 w-4 text-dynamic-green" />
                {t('new-habit')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            aria-label="Collapse sidebar"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-2 pt-1">
            {/* Planning Section */}
            <div className="mb-1">
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <LayoutDashboard className="h-3 w-3 text-muted-foreground/70" />
                <span className="font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider">
                  Planning
                </span>
                {tasks.length > 0 && (
                  <span className="rounded-full bg-foreground/8 px-1.5 py-px font-medium text-[10px] text-foreground/50">
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
            <div className="my-2 h-px bg-border/40" />

            {/* Scheduler Section */}
            <div className="mb-2">
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <CheckSquare className="h-3 w-3 text-muted-foreground/70" />
                <span className="font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider">
                  Smart Queue
                </span>
              </div>
              <TaskSchedulerPanel
                wsId={wsId}
                userId={assigneeId}
                onEventCreated={onEventCreated}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            </div>

            <div className="my-2 h-px bg-border/40" />

            {/* Habits Section */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <Repeat className="h-3 w-3 text-muted-foreground/70" />
                <span className="font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wider">
                  Habits
                </span>
              </div>
              <HabitsPanel wsId={wsId} onEventCreated={onEventCreated} />
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Dialogs */}
      <QuickTaskDialog
        wsId={wsId}
        open={quickTaskOpen}
        onOpenChange={setQuickTaskOpen}
        userId={assigneeId}
        isPersonalWorkspace={isPersonalWorkspace}
      />

      <HabitFormDialog
        wsId={wsId}
        open={habitFormOpen}
        onOpenChange={setHabitFormOpen}
        onSuccess={() => {
          setHabitFormOpen(false);
          onEventCreated?.();
        }}
      />
    </div>
  );
}
