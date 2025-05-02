'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import { Calendar } from '@tuturuuu/ui/legacy/calendar/Calendar';
import { useLocale, useTranslations } from 'next-intl';

export default function CalendarClientPage({
  googleToken,
  workspace,
}: {
  googleToken: WorkspaceCalendarGoogleToken | null;
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();

  return (
    <Calendar
      t={t}
      locale={locale}
      workspace={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
      googleToken={
        googleToken?.ws_id === workspace.id ? googleToken : undefined
      }
    />
  );
}
