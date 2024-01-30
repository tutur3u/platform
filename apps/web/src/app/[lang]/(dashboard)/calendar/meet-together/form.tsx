'use client';

import { Separator } from '@/components/ui/separator';
import DateSelector from './date-selector';
import { TimeSelector } from './time-selector';
import TimezoneSelector from './timezone-selector';
import CreatePlanDialog from './create-plan-dialog';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';
import { Timezone } from '@/types/primitives/Timezone';

export default function Form() {
  const { t } = useTranslation('meet-together');

  const [dates, setDates] = useState<Date[] | undefined>([]);
  const [startTime, setStartTime] = useState<number | undefined>(9);
  const [endTime, setEndTime] = useState<number | undefined>(17);
  const [timezone, setTimezone] = useState<Timezone | undefined>(undefined);

  const plan = {
    dates,
    startTime,
    endTime,
    timezone,
  };

  return (
    <div className="mb-32 flex flex-col items-center gap-8 text-center md:mb-8 md:flex-row md:gap-16">
      <div className="grid justify-center gap-4">
        <p className="text-xl font-semibold">{t('dates-to-meet-together')}</p>
        <DateSelector value={dates} onSelect={setDates} />
      </div>

      <Separator className="hidden h-96 md:block" orientation="vertical" />

      <div className="grid w-full justify-stretch gap-2">
        <p className="w-full text-xl font-semibold">
          {t('soonest-time-to-meet')}
        </p>
        <TimeSelector
          value={startTime}
          onValueChange={setStartTime}
          disabledTime={endTime}
        />

        <p className="mt-4 w-full text-xl font-semibold">
          {t('latest-time-to-meet')}
        </p>
        <TimeSelector
          value={endTime}
          onValueChange={setEndTime}
          disabledTime={startTime}
        />

        <Separator className="my-4" />

        <p className="w-full text-xl font-semibold">{t('time-zone')}</p>
        <TimezoneSelector value={timezone} onValueChange={setTimezone} />

        <div className="group relative mt-4 inline-flex">
          <div className="animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r from-rose-400 to-orange-300 opacity-70 blur-lg transition-all group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200 dark:from-rose-400/60 dark:to-orange-300/60"></div>
          <CreatePlanDialog plan={plan} />
        </div>
      </div>
    </div>
  );
}
