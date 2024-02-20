import React from 'react';
import DatePlanner from './date-planner';
import useTranslation from 'next-translate/useTranslation';
import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { Timeblock } from '@/types/primitives/Timeblock';

export default function AllAvailabilities({
  plan,
  timeblocks,
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
}) {
  const { t } = useTranslation('meet-together-plan-details');

  return (
    <div className="grid gap-2 text-center">
      <div className="font-semibold">{t('everyone_availability')}</div>

      <div className="flex items-center justify-center gap-2 text-sm">
        <div>0/0 {t('available')}</div>
        <div className="border-foreground/50 bg-foreground/10 h-4 w-24 border" />
        <div>0/0 {t('available')}</div>
      </div>

      <DatePlanner
      timeblocks={timeblocks}
        dates={plan.dates}
        start={plan.start_time}
        end={plan.end_time}
      />
    </div>
  );
}
