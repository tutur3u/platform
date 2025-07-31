'use client';

import AllAvailabilities from './all-availabilities';
import AvailabilityPlanner from './availability-planner';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@tuturuuu/types/primitives/Timeblock';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Calendar, Users } from '@tuturuuu/ui/icons';
import { useEffect, useState } from 'react';

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
          disabled={!isEditing && showBestTimes}
        >
          {isEditing ? (
            <>
              <Users size={16} />
              View Everyone
            </>
          ) : (
            <>
              <Calendar size={16} />
              Add Availability
            </>
          )}
        </Button>
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
