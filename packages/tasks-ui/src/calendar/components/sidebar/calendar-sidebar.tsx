'use client';

import { PanelLeftClose, PanelRightClose } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@tuturuuu/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { HabitsPanel } from '../habits-panel';
import PriorityView from '../priority-view';
import TimeTracker from '../time-tracker';

const SIDEBAR_COLLAPSED_KEY = 'calendar-sidebar-collapsed';
/** The plan panel sits beside the grid from this width; below it, a sheet. */
const INLINE_PANEL_QUERY = '(min-width: 1280px)';

interface CalendarSidebarProps {
  wsId: string;
  assigneeId: string;
  tasks?: ExtendedWorkspaceTask[];
  locale?: string;
  onEventCreated?: () => void;
  /** If true, skip auto-assignment when creating tasks (personal workspace) */
  isPersonalWorkspace?: boolean;
}

type PanelBodyProps = Omit<CalendarSidebarProps, 'locale'>;

function PlanPanelBody({
  wsId,
  assigneeId,
  tasks = [],
  onEventCreated,
  isPersonalWorkspace = false,
}: PanelBodyProps) {
  const t = useTranslations('calendar.plan_panel');
  return (
    <Tabs defaultValue="tasks" className="flex min-h-0 flex-1 flex-col gap-2">
      <TabsList className="mx-3 grid h-8 grid-cols-2">
        <TabsTrigger value="tasks" className="gap-1.5 text-xs">
          {t('tasks')}
          {tasks.length > 0 && (
            <span className="text-muted-foreground tabular-nums">
              {tasks.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="habits" className="text-xs">
          {t('habits')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tasks" className="mt-0 min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="px-3 pb-3">
            <PriorityView
              wsId={wsId}
              allTasks={tasks}
              assigneeId={assigneeId}
              isPersonalWorkspace={isPersonalWorkspace}
            />
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="habits" className="mt-0 min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="px-3 pb-3">
            <HabitsPanel wsId={wsId} onEventCreated={onEventCreated} />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

function PlanPanelHeader({
  title,
  wsId,
  tasks,
  action,
  className,
}: {
  title: ReactNode;
  wsId: string;
  tasks: ExtendedWorkspaceTask[];
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex h-10 shrink-0 items-center gap-2 px-3', className)}
    >
      {title}
      <div className="ml-auto flex min-w-0 items-center gap-1">
        <TimeTracker wsId={wsId} tasks={tasks} />
        {action}
      </div>
    </div>
  );
}

/**
 * The calendar's plan panel: tasks and habits beside the grid on wide
 * screens, a sheet over it on narrower ones, and a slim rail when closed.
 */
export function CalendarSidebar({
  wsId,
  assigneeId,
  tasks = [],
  onEventCreated,
  isPersonalWorkspace = false,
}: CalendarSidebarProps) {
  const t = useTranslations('calendar.plan_panel');
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === null ? true : saved === 'true';
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  const openPanel = () => {
    if (window.matchMedia(INLINE_PANEL_QUERY).matches) setIsCollapsed(false);
    else setSheetOpen(true);
  };
  const body = (
    <PlanPanelBody
      wsId={wsId}
      assigneeId={assigneeId}
      tasks={tasks}
      onEventCreated={onEventCreated}
      isPersonalWorkspace={isPersonalWorkspace}
    />
  );

  return (
    <>
      <div
        className={cn(
          'ml-2 hidden h-full shrink-0 flex-col items-center border-border border-l pt-1 pl-1 md:flex',
          !isCollapsed && 'xl:hidden'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              onClick={openPanel}
              aria-label={t('open')}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{t('open')}</TooltipContent>
        </Tooltip>
      </div>

      {!isCollapsed && (
        <aside
          aria-label={t('title')}
          className="ml-2 hidden h-full w-70 shrink-0 flex-col border-border border-l bg-background xl:flex 2xl:w-80"
        >
          <PlanPanelHeader
            title={<h2 className="font-medium text-sm">{t('title')}</h2>}
            wsId={wsId}
            tasks={tasks}
            action={
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                onClick={() => setIsCollapsed(true)}
                aria-label={t('collapse')}
              >
                <PanelRightClose className="size-4" />
              </Button>
            }
          />
          {body}
        </aside>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="flex w-80 flex-col gap-0 p-0 sm:max-w-80"
        >
          <PlanPanelHeader
            title={
              <SheetTitle className="font-medium text-sm">
                {t('title')}
              </SheetTitle>
            }
            wsId={wsId}
            tasks={tasks}
            className="pr-12"
          />
          {body}
        </SheetContent>
      </Sheet>
    </>
  );
}
