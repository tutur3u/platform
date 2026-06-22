'use client';

import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import { Calendar as DateCalendar } from '@tuturuuu/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import timezones from '@tuturuuu/utils/timezones';
import { useEffect, useState } from 'react';
import type { Locale } from '../../lib/platform/locale';
import { CreatePlanPrompt } from './create-plan-prompt';
import type { MeetTogetherContent } from './meet-together-content';
import { TimezoneSelector } from './timezone-selector';

type MeetTogetherFormProps = {
  content: MeetTogetherContent['form'];
  locale: Locale;
};

const hours = Array.from({ length: 24 }, (_, index) => index + 1);

export function MeetTogetherForm({ content, locale }: MeetTogetherFormProps) {
  const [dates, setDates] = useState<Date[] | undefined>([]);
  const [startTime, setStartTime] = useState<number | undefined>(9);
  const [endTime, setEndTime] = useState<number | undefined>(17);
  const [timezone, setTimezone] = useState<Timezone | undefined>();
  const canCreate = Boolean(dates?.length && startTime && endTime && timezone);

  useEffect(() => {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const matchedTimezone = timezones.find((item) =>
      item.utc.includes(browserTimezone)
    );

    if (matchedTimezone) setTimezone(matchedTimezone);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-8 px-2 text-center md:mb-8 md:px-4 lg:text-left">
      <div className="flex flex-col items-center justify-center gap-2">
        <p className="font-semibold">{content.datesLabel}</p>
        <div className="w-full max-w-[calc(100vw-2rem)] overflow-hidden">
          <DateCalendar
            className="mx-auto rounded-md border bg-background/50"
            classNames={{
              day: 'relative h-8 w-8 p-0 text-center text-sm sm:h-9 sm:w-9',
              day_button:
                'h-full w-full rounded-md p-0 font-normal transition-colors duration-300',
              head_row: 'flex justify-center gap-1 sm:gap-2',
              month:
                'w-full max-w-full min-w-70 space-y-4 p-2 text-center font-semibold sm:min-w-75',
              months: 'flex flex-col items-center',
              root: 'w-full max-w-full',
              row: 'flex justify-center gap-1 sm:gap-2',
              tbody: 'grid gap-2',
            }}
            minDate={new Date()}
            mode="multiple"
            onSelect={setDates}
            selected={dates}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 lg:items-start">
        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
          <TimeField
            content={content}
            disabledTime={endTime}
            isStartTime
            label={content.startTimeLabel}
            locale={locale}
            onValueChange={setStartTime}
            value={startTime}
          />
          <TimeField
            content={content}
            disabledTime={startTime}
            label={content.endTimeLabel}
            locale={locale}
            onValueChange={setEndTime}
            value={endTime}
          />
        </div>
        <Separator className="my-2" />
        <div className="grid w-full gap-1">
          <p className="w-full font-semibold">{content.timeZoneLabel}</p>
          <TimezoneSelector
            content={content}
            onValueChange={setTimezone}
            value={timezone}
          />
        </div>
        <CreatePlanPrompt canCreate={canCreate} content={content} />
      </div>
    </div>
  );
}

function TimeField({
  content,
  disabledTime,
  isStartTime = false,
  label,
  locale,
  onValueChange,
  value,
}: {
  content: MeetTogetherContent['form'];
  disabledTime?: number;
  isStartTime?: boolean;
  label: string;
  locale: Locale;
  onValueChange: (value: number) => void;
  value?: number;
}) {
  return (
    <div className="grid gap-1">
      <p className="w-full font-semibold">{label}</p>
      <Select
        value={value?.toString()}
        onValueChange={(next) => onValueChange(Number(next))}
      >
        <SelectTrigger className="bg-background/50 transition hover:bg-background/80">
          <SelectValue placeholder={content.selectTime} />
        </SelectTrigger>
        <SelectContent className="h-48">
          {hours.map((hour) => (
            <SelectItem
              disabled={isTimeDisabled(hour, disabledTime, isStartTime)}
              key={hour}
              value={hour.toString()}
            >
              {formatHour(hour, locale)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function isTimeDisabled(
  hour: number,
  disabledTime?: number,
  isStartTime = false
) {
  if (!disabledTime) return false;
  return isStartTime ? hour >= disabledTime : hour <= disabledTime;
}

function formatHour(hour: number, locale: Locale) {
  if (hour === 12) return '12:00 PM';
  if (hour === 24) return '12:00 AM';
  if (hour < 12)
    return `${String(hour).padStart(2, '0')}:00 ${locale === 'vi' ? 'SA' : 'AM'}`;
  return `${String(hour - 12).padStart(2, '0')}:00 ${locale === 'vi' ? 'CH' : 'PM'}`;
}
