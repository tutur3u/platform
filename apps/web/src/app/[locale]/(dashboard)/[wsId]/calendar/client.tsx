'use client';

import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from '@tuturuuu/icons';
import type {
    Workspace,
    WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import AddEventButton from './components/add-event-button';
import AddEventDialog from './components/add-event-dialog';
import AutoScheduleComprehensiveDialog from './components/auto-schedule-comprehensive-dialog';
import TestEventGeneratorButton from './components/test-event-generator-button';

export default function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);

  const extras =
    workspace.id === ROOT_WORKSPACE_ID ? (
      <div className="grid w-full items-center gap-2 md:flex md:w-auto">
        <AddEventButton onOpenDialog={() => setIsAddEventDialogOpen(true)} />
        {DEV_MODE && <TestEventGeneratorButton wsId={workspace.id} />}
        <AutoScheduleComprehensiveDialog wsId={workspace.id}>
          <Button
            variant="default"
            size="sm"
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 md:w-fit"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Auto-Schedule
          </Button>
        </AutoScheduleComprehensiveDialog>
      </div>
    ) : undefined;

  return (
    <>
      <SmartCalendar
        t={t}
        locale={locale}
        workspace={workspace}
        useQuery={useQuery}
        useQueryClient={useQueryClient}
        experimentalGoogleToken={
          experimentalGoogleToken?.ws_id === workspace.id
            ? experimentalGoogleToken
            : null
        }
        extras={extras}
      />
      <AddEventDialog
        wsId={workspace.id}
        isOpen={isAddEventDialogOpen}
        onClose={() => setIsAddEventDialogOpen(false)}
      />
    </>
  );
}
