'use client';

import { CalendarDays } from '@tuturuuu/icons';
import { isScheduleMonth } from '@tuturuuu/utils/topic-schedule';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopicAnnouncementsEmptyState } from '../topic-announcements-empty-state';
import { useTopicAnnouncements } from '../topic-announcements-shell';
import { ScheduleMonthEditor } from './schedule-month-editor';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Monthly GVNN schedule editor (Contacts -> topic announcements). Only with
 * teacher-assigned topics on; the API returns 404 otherwise. The month lives
 * in `?month=YYYY-MM` so a reload or shared link opens the same month.
 */
export function TopicSchedulePageClient() {
  const t = useTranslations('ws-topic-announcements');
  const { teacherAssignmentsEnabled, wsId } = useTopicAnnouncements();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams?.get('month') ?? '';
  const month = isScheduleMonth(requested) ? requested : currentMonth();

  if (!teacherAssignmentsEnabled) {
    return (
      <TopicAnnouncementsEmptyState
        description={t('schedule_unavailable_description')}
        icon={<CalendarDays />}
        title={t('schedule_unavailable_title')}
      />
    );
  }

  return (
    <ScheduleMonthEditor
      key={month}
      month={month}
      onMonthChange={(next) => router.replace(`${pathname}?month=${next}`)}
      wsId={wsId}
    />
  );
}
