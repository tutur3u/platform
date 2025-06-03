'use client';

import CreatePlanDialog from './create-plan-dialog';
import DateSelector from './date-selector';
import { TimeSelector } from './time-selector';
import TimezoneSelector from './timezone-selector';
import timezones from '@/data/timezones.json';
import { Timezone } from '@ncthub/types/primitives/Timezone';
import { Separator } from '@ncthub/ui/separator';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function Form() {
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
  };

  return (
    <div className="flex flex-col items-center gap-8 px-4 text-center md:mb-8 md:flex-row md:gap-16">
      <div className="grid justify-center gap-2">
        <p className="font-semibold">{t('dates-to-meet-together')}</p>
        <DateSelector value={dates} onSelect={setDates} />
      </div>

      <Separator className="hidden h-96 md:block" orientation="vertical" />
      <Separator className="md:hidden" />

      <div className="grid w-full justify-stretch gap-2 gap-x-4 lg:grid-cols-2">
        <div className="grid gap-1">
          <p className="w-full font-semibold">{t('soonest-time-to-meet')}</p>
          <TimeSelector
            value={startTime}
            onValueChange={setStartTime}
            disabledTime={endTime}
          />
        </div>

        <div className="grid gap-1">
          <p className="w-full font-semibold max-lg:mt-4">
            {t('latest-time-to-meet')}
          </p>
          <TimeSelector
            value={endTime}
            onValueChange={setEndTime}
            disabledTime={startTime}
          />
        </div>

        <Separator className="col-span-full my-4" />

        <div className="col-span-full grid gap-1">
          <p className="w-full font-semibold">{t('time-zone')}</p>
          <TimezoneSelector value={timezone} onValueChange={setTimezone} />
        </div>

        <CreatePlanDialog plan={plan} />
      </div>
    </div>
  );
}
