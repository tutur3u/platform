'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { Calendar } from '@tuturuuu/ui/legacy/calendar/Calendar';
import { useTranslations } from 'next-intl';

export default function CalendarClientPage({
  workspace,
}: {
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');

  return (
    <Calendar
      t={t}
      workspace={workspace}
      useQuery={useQuery}
      useQueryClient={useQueryClient}
    />
  );
}
