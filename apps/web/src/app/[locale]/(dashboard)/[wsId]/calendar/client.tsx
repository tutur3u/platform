'use client';

import AutoScheduleComprehensiveDialog from './components/auto-schedule-comprehensive-dialog';
import TestEventGeneratorButton from './components/test-event-generator-button';
import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Workspace, WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Sparkles } from '@tuturuuu/ui/icons';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { useLocale, useTranslations } from 'next-intl';

export default function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();

  const extras = (
    <div className="flex items-center gap-2">
      {DEV_MODE && <TestEventGeneratorButton wsId={workspace.id} />}
      <AutoScheduleComprehensiveDialog wsId={workspace.id}>
        <Button
          variant="default"
          size="sm"
          className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Auto-Schedule
        </Button>
      </AutoScheduleComprehensiveDialog>
    </div>
  );

  return (
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
    />
  );
}
