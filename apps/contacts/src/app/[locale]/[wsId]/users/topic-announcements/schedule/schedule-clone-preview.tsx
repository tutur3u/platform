'use client';

import type { TopicScheduleCloneItem } from '@tuturuuu/internal-api/topic-announcements';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { formatScheduleDay } from './schedule-format';

const STATUS_STYLE: Record<TopicScheduleCloneItem['status'], string> = {
  create: 'border-dynamic-green/40 bg-dynamic-green/10 text-dynamic-green',
  exists: 'border-border bg-muted text-muted-foreground',
  unplaced: 'border-dynamic-orange/40 bg-dynamic-orange/10 text-dynamic-orange',
};

/** Source -> target mapping, one line per session, before anything is saved. */
export function ScheduleClonePreview({
  items,
}: {
  items: readonly TopicScheduleCloneItem[];
}) {
  const t = useTranslations('ws-topic-announcements');
  const locale = useLocale();

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        {t('schedule_clone_empty')}
      </p>
    );
  }

  const counts = {
    create: items.filter((item) => item.status === 'create').length,
    exists: items.filter((item) => item.status === 'exists').length,
    unplaced: items.filter((item) => item.status === 'unplaced').length,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {(['create', 'exists', 'unplaced'] as const).map((status) => (
          <Badge
            className={cn('border', STATUS_STYLE[status])}
            key={status}
            variant="outline"
          >
            {t(`schedule_clone_status_${status}`)}: {counts[status]}
          </Badge>
        ))}
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                {t('schedule_column_class')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('schedule_clone_from')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('schedule_clone_to')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('schedule_column_start')}
              </th>
              <th className="px-3 py-2 text-left font-medium">
                {t('schedule_clone_result')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr className="border-t" key={item.sourceId}>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {item.classLabel ?? '--'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 capitalize tabular-nums">
                  {formatScheduleDay(item.sourceDate, locale)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 capitalize tabular-nums">
                  {item.targetDate
                    ? formatScheduleDay(item.targetDate, locale)
                    : '--'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                  {item.startTime}
                  {item.endTime ? `-${item.endTime}` : ''}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs',
                      STATUS_STYLE[item.status]
                    )}
                  >
                    {item.reason
                      ? t(`schedule_clone_reason_${item.reason}`)
                      : t(`schedule_clone_status_${item.status}`)}
                  </span>
                  {item.status === 'create' && !item.gvnnContactId ? (
                    <span className="ml-1.5 whitespace-nowrap text-dynamic-orange text-xs">
                      {t('schedule_needs_gvnn')}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
