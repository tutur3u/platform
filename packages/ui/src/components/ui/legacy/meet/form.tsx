'use client';

import type { User } from '@tuturuuu/types';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import timezones from '@tuturuuu/utils/timezones';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import CreatePlanDialog from './create-plan-dialog';
import { CreatePlanSignInPrompt } from './create-plan-sign-in-prompt';
import DateSelector from './date-selector';
import { TimeSelector } from './time-selector';
import TimezoneSelector from './timezone-selector';

export default function Form({
  wsId,
  user,
  planBasePath,
}: {
  wsId?: string;
  user: Partial<User> | null;
  planBasePath: string;
}) {
  const t = useTranslations('meet-together');

  const [dates, setDates] = useState<Date[] | undefined>([]);
  const [startTime, setStartTime] = useState<number | undefined>(9);
  const [endTime, setEndTime] = useState<number | undefined>(17);
  const [timezone, setTimezone] = useState<Timezone | undefined>(undefined);
  const [durationMinutes, setDurationMinutes] = useState(60);

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
    durationMinutes,
    wsId,
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-medium text-sm">{t('dates-to-meet-together')}</p>
        <DateSelector value={dates} onSelect={setDates} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="font-medium text-sm">{t('soonest-time-to-meet')}</p>
          <TimeSelector
            value={startTime}
            onValueChange={setStartTime}
            disabledTime={endTime}
            isStartTime={true}
          />
        </div>
        <div className="space-y-2">
          <p className="font-medium text-sm">{t('latest-time-to-meet')}</p>
          <TimeSelector
            value={endTime}
            onValueChange={setEndTime}
            disabledTime={startTime}
            isStartTime={false}
          />
        </div>
      </div>
      <div className="space-y-2">
        <p className="font-medium text-sm">{t('time-zone')}</p>
        <TimezoneSelector value={timezone} onValueChange={setTimezone} />
      </div>
      <div className="space-y-2">
        <p className="font-medium text-sm">{t('duration')}</p>
        <Tabs
          value={String(durationMinutes)}
          onValueChange={(value) => setDurationMinutes(Number(value))}
        >
          <TabsList className="grid h-auto w-full grid-cols-4">
            {[30, 45, 60, 90].map((minutes) => (
              <TabsTrigger key={minutes} value={String(minutes)}>
                {minutes}m
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {user?.id ? (
        <CreatePlanDialog plan={plan} user={user} planBasePath={planBasePath} />
      ) : (
        <CreatePlanSignInPrompt />
      )}
    </div>
  );
}
