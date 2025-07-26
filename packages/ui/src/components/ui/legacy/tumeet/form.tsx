'use client';

import CreatePlanDialog from './create-plan-dialog';
import DateSelector from './date-selector';
import { TimeSelector } from './time-selector';
import TimezoneSelector from './timezone-selector';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import { Separator } from '@tuturuuu/ui/separator';
import timezones from '@tuturuuu/utils/timezones';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

dayjs.extend(timezone);
dayjs.extend(utc);

// Component to display user's current timezone and time
function UserTimezoneDisplay() {
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [offset, setOffset] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const tz = dayjs.tz.guess();
      const now = dayjs().tz(tz);
      const timeStr = now.format('HH:mm');
      const offsetStr = now.format('Z'); // e.g., "+08:00"

      setUserTimezone(tz);
      setCurrentTime(timeStr);
      setOffset(offsetStr);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  if (!userTimezone) return null;

  return (
    <div className="mb-4 rounded-lg bg-dynamic-blue/5 p-3 text-sm">
      <div className="flex items-center justify-center gap-2 text-dynamic-blue lg:justify-start">
        <span role="img" aria-label="clock" className="text-base">
          🕒
        </span>
        <span className="font-medium">Your timezone:</span>
        <span className="font-semibold">{userTimezone}</span>
        <span className="text-dynamic-blue/70">(UTC{offset})</span>
      </div>
      <div className="mt-1 flex items-center justify-center gap-2 text-dynamic-blue/80 lg:justify-start">
        <span role="img" aria-label="calendar" className="text-base">
          🗓️
        </span>
        <span className="font-medium">Local time:</span>
        <span className="font-semibold">{currentTime}</span>
      </div>
    </div>
  );
}

// Utility function to get timezone info for display
function getTimezoneInfo(offset: number | undefined) {
  if (offset === undefined) return null;

  const matchingTimezones = timezones.filter((tz) => tz.offset === offset);
  if (matchingTimezones.length === 0) return null;

  // Prefer non-DST timezones
  const nonDstTimezone = matchingTimezones.find((tz) => !tz.isdst);
  const timezone = nonDstTimezone || matchingTimezones[0];

  if (!timezone) return null;

  return {
    name: timezone.value,
    text: timezone.text,
    offset: timezone.offset,
    isdst: timezone.isdst,
  };
}

export default function Form({ wsId }: { wsId?: string }) {
  const t = useTranslations('meet-together');

  const [dates, setDates] = useState<Date[] | undefined>([]);
  const [startTime, setStartTime] = useState<number | undefined>(9);
  const [endTime, setEndTime] = useState<number | undefined>(17);
  const [timezone, setTimezone] = useState<Timezone | undefined>(undefined);

  useEffect(() => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const timezone = timezones.find((timezone) =>
      timezone.utc.includes(userTimezone)
    );

    if (timezone) setTimezone(timezone);
    return () => setTimezone(undefined);
  }, []);

  const plan = {
    dates,
    startTime,
    endTime,
    timezone,
    wsId,
  };

  return (
    <div className="grid grid-cols-1 gap-8 px-2 text-center md:mb-8 md:px-4 lg:text-left">
      {/* Date Selector */}
      <div className="flex flex-col items-center justify-center gap-2">
        <p className="font-semibold">{t('dates-to-meet-together')}</p>
        <UserTimezoneDisplay />
        <div>
          <DateSelector
            value={dates}
            onSelect={setDates}
            className="bg-background/50"
          />
        </div>
      </div>

      {/* Time and Timezone Controls */}
      <div className="flex flex-col items-center gap-4 lg:items-start">
        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <p className="w-full font-semibold">{t('soonest-time-to-meet')}</p>
            <TimeSelector
              value={startTime}
              onValueChange={setStartTime}
              disabledTime={endTime}
            />
          </div>
          <div className="grid gap-1">
            <p className="w-full font-semibold">{t('latest-time-to-meet')}</p>
            <TimeSelector
              value={endTime}
              onValueChange={setEndTime}
              disabledTime={startTime}
            />
          </div>
        </div>
        <Separator className="my-2" />
        <div className="grid w-full gap-1">
          <p className="w-full font-semibold">{t('time-zone')}</p>
          <TimezoneSelector value={timezone} onValueChange={setTimezone} />
        </div>
        <div className="flex w-full justify-center lg:justify-start">
          <CreatePlanDialog plan={plan} />
        </div>
      </div>
    </div>
  );
}
