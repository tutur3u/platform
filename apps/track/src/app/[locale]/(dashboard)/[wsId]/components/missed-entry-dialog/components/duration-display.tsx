import { formatDuration } from '@tuturuuu/hooks/utils/time-format';
import { Clock } from '@tuturuuu/icons';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

interface DurationDisplayProps {
  startTime: string;
  endTime: string;
}

export function DurationDisplay({ startTime, endTime }: DurationDisplayProps) {
  const t = useTranslations('time-tracker.missed_entry_dialog');

  if (!startTime || !endTime) return null;

  const start = dayjs(startTime);
  const end = dayjs(endTime);
  const isInvalidRange = end.isBefore(start);
  const durationMs = end.diff(start);
  const duration = Math.floor(durationMs / 1000);

  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Clock className="h-4 w-4" />
        <span>{t('duration.label')}</span>
        <span className="font-medium text-foreground">
          {isInvalidRange
            ? t('duration.invalidRange')
            : formatDuration(duration)}
        </span>
      </div>
    </div>
  );
}
