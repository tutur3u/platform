'use client';

import { TaskCalendarPageShell } from '@tuturuuu/tasks-ui/calendar/task-calendar-page-shell';
import type {
  Workspace,
  WorkspaceCalendarGoogleTokenClient,
} from '@tuturuuu/types';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { calendarNavigationDate } from '@tuturuuu/ui/lib/calendar-day';
import { useTranslations } from 'next-intl';
import { type ComponentProps, useEffect, useMemo, useRef } from 'react';
import { useCalendarNavigation } from './calendar-navigation-provider';

export function CalendarWorkspacePage({
  enableSmartScheduling,
  experimentalGoogleToken,
  initialDate,
  initialEventId,
  isPersonalWorkspace,
  locale,
  smartSchedulingTasks,
  userId,
  workspace,
}: {
  enableSmartScheduling: boolean;
  experimentalGoogleToken?: WorkspaceCalendarGoogleTokenClient | null;
  initialDate?: string;
  initialEventId?: string;
  isPersonalWorkspace: boolean;
  locale: string;
  smartSchedulingTasks: ComponentProps<
    typeof TaskCalendarPageShell
  >['smartSchedulingTasks'];
  userId: string;
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const isMobile = useIsMobile();
  const navigation = useCalendarNavigation();
  const appliedDate = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !initialDate ||
      !navigation.timezone ||
      appliedDate.current === initialDate
    )
      return;
    const date = calendarNavigationDate(initialDate, navigation.timezone);
    if (date) {
      appliedDate.current = initialDate;
      navigation.setDate(date);
    }
  }, [initialDate, navigation.setDate, navigation.timezone]);
  const availableViews = useMemo(
    () => [
      { label: t('day'), value: 'day' },
      { disabled: isMobile, label: t('4-days'), value: '4-days' },
      { disabled: isMobile, label: t('week'), value: 'week' },
      { label: t('month'), value: 'month' },
      { label: t('year'), value: 'year' },
      { label: t('agenda'), value: 'agenda' },
    ],
    [isMobile, t]
  );

  return (
    <TaskCalendarPageShell
      className="h-[calc(100dvh-2rem)]"
      calendarConnections={[]}
      enableSmartScheduling={enableSmartScheduling}
      experimentalGoogleToken={experimentalGoogleToken}
      initialEventId={initialEventId}
      externalState={{ ...navigation, availableViews }}
      isPersonalWorkspace={isPersonalWorkspace}
      locale={locale}
      manageCalendarSyncProvider={false}
      showConnectionsManager={false}
      smartSchedulingTasks={smartSchedulingTasks}
      userId={userId}
      workspace={workspace}
    />
  );
}
