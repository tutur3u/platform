'use client';

import { Workspace, WorkspaceCalendarGoogleToken } from '@ncthub/types/db';
import { SmartCalendar } from '@ncthub/ui/legacy/calendar/smart-calendar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';

export default function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken;
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();

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
          : undefined
      }
    />
  );
}
