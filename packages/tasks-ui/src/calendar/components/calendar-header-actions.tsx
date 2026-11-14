'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  ChevronDown,
  Flame,
  PlusIcon,
  Repeat,
  Sparkles,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { CalendarHeaderActionsProps } from '@tuturuuu/ui/calendar-app/calendar-client-page';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useWorkspaceActor } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useCreateCalendarEvent } from '@tuturuuu/ui/legacy/calendar/toolbar-new-event';
import { NativeRecurrenceDialog } from '@tuturuuu/ui/legacy/calendar/native-recurrence-dialog';
import { useCalendarSettings } from '@tuturuuu/ui/legacy/calendar/settings/settings-context';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import HabitFormDialog from '../../tu-do/habits/habit-form-dialog';
import { QuickTaskDialog } from './quick-task-dialog';
import { SmartScheduleDialogs } from './smart-schedule-button';

type CreateDialog = 'task' | 'habit' | 'recurrence' | 'smart-schedule';

export function CalendarHeaderActions({
  workspaceId,
}: CalendarHeaderActionsProps) {
  const t = useTranslations('calendar');
  const queryClient = useQueryClient();
  const { readOnly } = useCalendar();
  // Same assignment rule as the Plan panel's "New task" (tasks-sidebar.tsx).
  const userId = useWorkspaceActor()?.actorId;
  const { settings } = useCalendarSettings();
  const { createEvent, disabled: eventDisabled } = useCreateCalendarEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<CreateDialog | null>(null);

  const open = (next: CreateDialog) => {
    setMenuOpen(false);
    setDialog(next);
  };
  const dialogOpenChange = (target: CreateDialog) => (isOpen: boolean) =>
    setDialog(isOpen ? target : null);

  const newEventLabel = t('new-event');

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            className="rounded-r-none @max-3xl/toolbar:has-[>svg]:px-2"
            onClick={createEvent}
            disabled={eventDisabled}
            aria-label={newEventLabel}
          >
            <PlusIcon className="size-4" />
            <span className="@max-3xl/toolbar:hidden">{t('new')}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{newEventLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            className="size-8 rounded-l-none border-primary-foreground/20 border-l"
            aria-label={t('new_menu.more')}
          >
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => open('task')}>
            <CheckSquare />
            {t('new_menu.task')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => open('habit')}>
            <Flame />
            {t('new_menu.habit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={readOnly}
            onSelect={() => open('recurrence')}
          >
            <Repeat />
            {t('new_menu.recurring_event')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => open('smart-schedule')}>
            <Sparkles />
            {t('new_menu.smart_schedule')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NativeRecurrenceDialog
        wsId={workspaceId}
        open={dialog === 'recurrence'}
        onOpenChange={dialogOpenChange('recurrence')}
        readOnly={readOnly}
        timezone={settings.timezone.timezone}
      />
      <QuickTaskDialog
        wsId={workspaceId}
        open={dialog === 'task'}
        onOpenChange={dialogOpenChange('task')}
        userId={userId}
        isPersonalWorkspace={workspaceId === userId}
      />
      <HabitFormDialog
        wsId={workspaceId}
        open={dialog === 'habit'}
        onOpenChange={dialogOpenChange('habit')}
        onSuccess={() => {
          setDialog(null);
          // The calendar Plan panel lists habits from this query.
          void queryClient.invalidateQueries({
            queryKey: ['habits', workspaceId],
          });
        }}
      />
      <SmartScheduleDialogs
        wsId={workspaceId}
        requested={dialog === 'smart-schedule'}
        onRequestEnd={() => setDialog(null)}
      />
    </div>
  );
}
