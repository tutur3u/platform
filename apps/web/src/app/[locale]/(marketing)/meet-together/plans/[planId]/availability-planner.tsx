import DatePlanner from './date-planner';
import { useTimeBlocking } from './time-blocking-provider';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function AvailabilityPlanner({
  plan,
  timeblocks,
  disabled,
  className = '', // allow parent to control alignment
}: {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('meet-together-plan-details');
  const { syncTimeBlocks, editing } = useTimeBlocking();
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Mark as dirty when editing ends
  useEffect(() => {
    if (!editing.enabled) {
      setDirty(true);
    }
  }, [editing.enabled]);

  // Optionally, reset dirty flag after save
  const handleSave = async () => {
    setIsSaving(true);
    await syncTimeBlocks();
    setIsSaving(false);
    setDirty(false);
  };

  return (
    <div
      className={`flex flex-col items-center ${className}`}
      style={{ minWidth: '260px' }}
    >
      <div className="text-center font-semibold">{t('your_availability')}</div>
      <div className="mt-1 mb-2 flex items-center justify-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div>{t('unavailable')}</div>
          <div className="h-4 w-8 border border-foreground/50 bg-red-500/20" />
        </div>
        <div className="flex items-center gap-2">
          <div>{t('available')}</div>
          <div className="h-4 w-8 border border-foreground/50 bg-green-500/70" />
        </div>
      </div>
      <DatePlanner
        timeblocks={timeblocks}
        dates={plan.dates}
        start={plan.start_time}
        end={plan.end_time}
        disabled={disabled}
        editable
      />
      <button
        className="mx-auto mt-8 block rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 px-8 py-3 text-lg font-semibold text-white shadow-md transition-all duration-150 ease-in-out hover:scale-105 hover:from-indigo-600 hover:via-sky-600 hover:to-emerald-600 focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:outline-none active:scale-100 disabled:cursor-not-allowed disabled:from-gray-400 disabled:via-gray-400 disabled:to-gray-400"
        style={{
          minWidth: '120px',
          minHeight: '48px',
          letterSpacing: '0.01em',
        }}
        onClick={handleSave}
        disabled={!dirty || isSaving}
      >
        {isSaving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
