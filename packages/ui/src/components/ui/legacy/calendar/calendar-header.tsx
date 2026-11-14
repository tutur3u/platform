import { CalendarCheck, ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Kbd } from '@tuturuuu/ui/kbd';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import type { ComponentType, ReactNode } from 'react';
import { useCalendarClock } from '../../../../hooks/use-calendar-clock';
import { useCalendarDayZone } from '../../../../hooks/use-calendar-day-zone';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import { calendarToday } from '../../../../lib/calendar-day';
import { CalendarHeaderDateProvider } from './toolbar-new-event';
import { useCalendarSettings } from './settings/settings-context';
import { CALENDAR_VIEW_KEYS } from './use-calendar-view-shortcuts';

/**
 * Fixed toolbar height (48px). Loading skeletons reserve the same row so the
 * header never shifts the grid when it mounts.
 */
export const CALENDAR_HEADER_HEIGHT_CLASS = 'h-12';

type Translate = (key: string) => string;

const VIEW_SHORTCUTS: Partial<Record<CalendarView, string>> = {};
for (const [key, view] of Object.entries(CALENDAR_VIEW_KEYS)) {
  VIEW_SHORTCUTS[view] = key.toUpperCase();
}

function toCalendarView(value: string): CalendarView | null {
  return Object.values(CALENDAR_VIEW_KEYS).find((v) => v === value) ?? null;
}

function todayLabelKey(view: CalendarView) {
  switch (view) {
    case 'day':
      return 'today';
    case 'week':
    case '4-days':
    case 'agenda':
      return 'this-week';
    case 'month':
      return 'this-month';
    case 'year':
      return 'this-year';
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
}

function ToolbarIconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClick}
          aria-label={label}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CalendarHeader({
  t,
  locale,
  date,
  setDate,
  view,
  offset,
  availableViews,
  onViewChange,
  extras,
}: {
  t: Translate;
  locale: string;
  date: Date;
  setDate: React.Dispatch<React.SetStateAction<Date>>;
  view: CalendarView;
  offset: number;
  availableViews: { value: string; label: string; disabled?: boolean }[];
  onViewChange: (view: CalendarView) => void;
  extras?: ReactNode;
}) {
  const { settings } = useCalendarSettings();
  const zone = settings.timezone.timezone;
  const dayZone = useCalendarDayZone();
  const today = calendarToday(zone, useCalendarClock());
  // Views a device cannot show (for example week on phones) are hidden.
  const views = availableViews.filter((item) => item?.disabled !== true);
  const currentViewLabel = views.find((item) => item.value === view)?.label;

  const title =
    view === 'year'
      ? String(date.getFullYear())
      : dayjs(date)
          .locale(locale)
          .format(locale === 'vi' ? 'MMMM, YYYY' : 'MMMM YYYY')
          .replace(/^\w/, (c) => c.toUpperCase());

  const shift = (direction: 1 | -1) =>
    setDate((current) => {
      const next = new Date(current);
      if (view === 'year') next.setFullYear(next.getFullYear() + direction);
      else if (view === 'month') next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + direction * offset);
      return next;
    });

  const selectToday = () =>
    dayZone?.goToToday ? dayZone.goToToday() : setDate(today);
  const isCurrentPeriod =
    dayjs(date).isSame(dayjs(today), 'day') ||
    (view === 'month' &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()) ||
    (view === 'year' && date.getFullYear() === today.getFullYear());
  const todayLabel = t(todayLabelKey(view));

  return (
    <CalendarHeaderDateProvider value={date}>
      <div
        data-slot="calendar-header"
        className={cn(
          CALENDAR_HEADER_HEIGHT_CLASS,
          '@container/toolbar flex min-w-0 shrink-0 items-center gap-1'
        )}
      >
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarIconButton
            label={t('toolbar.previous_period')}
            icon={ChevronLeft}
            onClick={() => shift(-1)}
          />
          <ToolbarIconButton
            label={t('toolbar.next_period')}
            icon={ChevronRight}
            onClick={() => shift(1)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="@max-3xl/toolbar:w-8 @max-3xl/toolbar:px-0"
                onClick={isCurrentPeriod ? undefined : selectToday}
                disabled={isCurrentPeriod}
                aria-label={todayLabel}
              >
                <span className="@3xl/toolbar:hidden">
                  <CalendarCheck className="size-4" />
                </span>
                <span className="@max-3xl/toolbar:hidden">{todayLabel}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{todayLabel}</TooltipContent>
          </Tooltip>
        </div>

        <h2 className="min-w-0 flex-1 truncate px-1 font-semibold text-base">
          {title}
        </h2>

        {views.length > 1 && (
          <Select
            value={view}
            onValueChange={(value) => {
              const next = toCalendarView(value);
              if (next) onViewChange(next);
            }}
          >
            <SelectTrigger
              className="h-8 w-auto shrink-0 gap-1 px-2"
              aria-label={t('toolbar.view')}
            >
              <SelectValue placeholder={t('view')}>
                {currentViewLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {views.map((item) => {
                const itemView = toCalendarView(item.value);
                const shortcut = itemView ? VIEW_SHORTCUTS[itemView] : null;
                return (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    textValue={item.label}
                    className="*:[span]:last:flex-1"
                  >
                    {item.label}
                    {shortcut && (
                      <Kbd
                        className="ml-auto"
                        data-testid={`calendar-view-shortcut-${item.value}`}
                      >
                        {shortcut}
                      </Kbd>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}

        <div
          data-slot="calendar-header-extras"
          className="flex shrink-0 items-center gap-1 empty:hidden"
        >
          {extras}
        </div>
      </div>
    </CalendarHeaderDateProvider>
  );
}
