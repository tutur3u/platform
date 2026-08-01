'use client';

import { Calendar, Redo2, Save, Undo2, Users } from '@tuturuuu/icons';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import AllAvailabilities from './all-availabilities';
import AvailabilityPlanner from './availability-planner';

interface UnifiedAvailabilityProps {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
  showBestTimes?: boolean;
  onBestTimesStatusByDateAction?: (status: Record<string, boolean>) => void;
}

export default function UnifiedAvailability({
  plan,
  timeblocks,
  showBestTimes = false,
  onBestTimesStatusByDateAction,
}: UnifiedAvailabilityProps) {
  const t = useTranslations('meet-together-plan-details');
  const { isDirty, handleSave, isSaving, canUndo, canRedo, undo, redo } =
    useTimeBlocking();
  const [isEditing, setIsEditing] = useState(false);
  const { user, setDisplayMode } = useTimeBlocking();

  // Auto-switch to everyone's view when showBestTimes is enabled
  // because best times only make sense when viewing everyone's availability
  useEffect(() => {
    if (showBestTimes && isEditing) {
      setIsEditing(false);
    }
  }, [showBestTimes, isEditing]);

  const handleToggleMode = () => {
    if (user) {
      setIsEditing(!isEditing);
    } else {
      setDisplayMode('account-switcher');
    }
  };

  return (
    <div className="flex flex-col gap-4 text-center">
      {/* Header with toggle button */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="lg"
          onClick={handleToggleMode}
          className="flex items-center gap-2"
          disabled={!isEditing && (showBestTimes || plan.is_confirmed)}
        >
          {isEditing ? (
            <>
              <Users size={16} />
              {t('view_everyone')}
            </>
          ) : (
            <>
              <Calendar size={16} />
              {t('add_availability')}
            </>
          )}
        </Button>
        {isEditing && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={undo}
              disabled={!canUndo}
              aria-label={t('undo')}
            >
              <Undo2 size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={redo}
              disabled={!canRedo}
              aria-label={t('redo')}
            >
              <Redo2 size={16} />
            </Button>
            <Button
              variant="default"
              size="lg"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              <Save size={16} />
              {isSaving ? t('saving') : t('save_changes')}
            </Button>
          </div>
        )}
      </div>

      {isEditing ? (
        <AvailabilityPlanner plan={plan} timeblocks={[]} disabled={!user} />
      ) : (
        <AllAvailabilities
          plan={plan}
          timeblocks={timeblocks}
          showBestTimes={showBestTimes}
          onBestTimesStatusByDateAction={onBestTimesStatusByDateAction}
        />
      )}
    </div>
  );
}
