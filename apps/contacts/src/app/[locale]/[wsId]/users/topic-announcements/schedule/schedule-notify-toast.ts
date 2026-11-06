import type { TopicScheduleNotification } from '@tuturuuu/internal-api/topic-announcements';
import { toast } from '@tuturuuu/ui/sonner';
import type { useTranslations } from 'next-intl';

/** Toasts the outcome of "Notify teachers" after a save or clone. */
export function toastScheduleNotification(
  t: ReturnType<typeof useTranslations>,
  notification: TopicScheduleNotification | undefined
) {
  if (!notification) return;
  if (notification.failed) {
    toast.error(t('schedule_notify_failed'));
    return;
  }
  const { failedTeachers, notifiedTeachers, skippedUnlinkedTeachers } =
    notification.result;
  if (notifiedTeachers > 0) {
    toast.success(t('schedule_notify_sent', { count: notifiedTeachers }));
  }
  if (skippedUnlinkedTeachers > 0) {
    toast.warning(
      t('schedule_notify_skipped', { count: skippedUnlinkedTeachers })
    );
  }
  if (failedTeachers > 0) {
    toast.error(t('schedule_notify_partial_failed', { count: failedTeachers }));
  }
}
