'use client';

import { CheckSquare, ChevronDown, PlusIcon, Repeat } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { CalendarHeaderActionsProps } from '@tuturuuu/ui/calendar-app/calendar-client-page';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import HabitFormDialog from '../../tu-do/habits/habit-form-dialog';
import { QuickTaskDialog } from './quick-task-dialog';
import { SmartScheduleButton } from './smart-schedule-button';

export function CalendarHeaderActions({
  workspaceId,
}: CalendarHeaderActionsProps) {
  const t = useTranslations('calendar');
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [habitFormOpen, setHabitFormOpen] = useState(false);

  return (
    <div className="grid w-full items-center gap-2 md:flex md:w-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="default" size="xs" className="gap-1.5">
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{t('create')}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setQuickTaskOpen(true)}>
            <CheckSquare className="h-4 w-4" />
            {t('new-task')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setHabitFormOpen(true)}>
            <Repeat className="h-4 w-4" />
            {t('new-habit')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SmartScheduleButton wsId={workspaceId} />

      <QuickTaskDialog
        wsId={workspaceId}
        open={quickTaskOpen}
        onOpenChange={setQuickTaskOpen}
      />

      <HabitFormDialog
        wsId={workspaceId}
        open={habitFormOpen}
        onOpenChange={setHabitFormOpen}
        onSuccess={() => setHabitFormOpen(false)}
      />
    </div>
  );
}
