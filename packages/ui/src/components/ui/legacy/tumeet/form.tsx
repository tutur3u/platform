'use client';

import type { User } from '@tuturuuu/types';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import { Separator } from '@tuturuuu/ui/separator';
import timezones from '@tuturuuu/utils/timezones';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import CreatePlanDialog from './create-plan-dialog';
import DateSelector from './date-selector';
import { TimeSelector } from './time-selector';
import TimezoneSelector from './timezone-selector';

export default function Form({
  wsId,
  user,
}: {
  wsId?: string;
  user: Partial<User> | null;
}) {
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
              isStartTime={true}
            />
          </div>
          <div className="grid gap-1">
            <p className="w-full font-semibold">{t('latest-time-to-meet')}</p>
            <TimeSelector
              value={endTime}
              onValueChange={setEndTime}
              disabledTime={startTime}
              isStartTime={false}
            />
          </div>
        </div>
        <Separator className="my-2" />
        <div className="grid w-full gap-1">
          <p className="w-full font-semibold">{t('time-zone')}</p>
          <TimezoneSelector value={timezone} onValueChange={setTimezone} />
        </div>
        <div className="flex w-full justify-center lg:justify-start">
          <CreatePlanDialog plan={plan} user={user} />
        </div>
      </div>
    </div>
  );
}
