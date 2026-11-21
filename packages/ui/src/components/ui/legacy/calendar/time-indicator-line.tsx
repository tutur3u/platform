import { useCalendarClock } from '@tuturuuu/ui/hooks/use-calendar-clock';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import { HOUR_HEIGHT } from './config';
import { useCalendarSettings } from './settings/settings-context';

dayjs.extend(timezone);

/**
 * Current-time marker: a faint rule across every visible day and a solid
 * line with a dot on today's column.
 */
export const TimeIndicatorLine = ({
  columnIndex,
  columnsCount,
}: {
  columnIndex: number;
  columnsCount: number;
}) => {
  const { settings } = useCalendarSettings();
  const tz = settings?.timezone?.timezone;
  const now = dayjs(useCalendarClock());
  const nowTz = tz && tz !== 'auto' ? now.tz(tz) : now;
  const totalHours = nowTz.hour() + nowTz.minute() / 60 + nowTz.second() / 3600;

  return (
    <div
      aria-hidden
      data-testid="calendar-now-indicator"
      className="pointer-events-none absolute inset-x-0 top-0 z-10"
      style={{
        transform: `translateY(${totalHours * HOUR_HEIGHT}px)`,
        transition: 'transform 0.3s ease-out',
      }}
    >
      <div className="absolute inset-x-0 -top-px h-px bg-dynamic-red/40" />
      <div
        className="absolute -top-px h-0.5 bg-dynamic-red"
        style={{
          left: `${(columnIndex / columnsCount) * 100}%`,
          width: `${(1 / columnsCount) * 100}%`,
        }}
      >
        <div className="absolute -top-1 -left-1 size-2.5 rounded-full bg-dynamic-red ring-2 ring-background" />
      </div>
    </div>
  );
};
