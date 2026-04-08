'use client';

import type { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import type { Timeblock } from '@ncthub/types/primitives/Timeblock';
import { Button } from '@ncthub/ui/button';
import { Calendar, Save, Users } from '@ncthub/ui/icons';
import { useEffect, useState } from 'react';
import AllAvailabilities from './all-availabilities';
import AvailabilityPlanner from './availability-planner';
import { useTimeBlocking } from './time-blocking-provider';

interface UnifiedAvailabilityProps {
  plan: MeetTogetherPlan;
  timeblocks: Timeblock[];
}

export default function UnifiedAvailability({
  plan,
  timeblocks,
}: UnifiedAvailabilityProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { handleSave, isDirty, isSaving, user, setDisplayMode } =
    useTimeBlocking();

  useEffect(() => {
    if (!user && isEditing) {
      setIsEditing(false);
    }
  }, [isEditing, user]);

  const handleToggleMode = () => {
    if (user) {
      setIsEditing((current) => !current);
      return;
    }

    setDisplayMode('account-switcher');
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="lg"
          onClick={handleToggleMode}
          className="flex items-center gap-2"
          disabled={!isEditing && plan.is_confirmed}
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

        {isEditing ? (
          <Button
            size="lg"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            <Save size={16} />
            {isSaving ? 'Saving changes...' : 'Save changes'}
          </Button>
        ) : null}
      </div>

      {isEditing ? (
        <AvailabilityPlanner
          plan={plan}
          timeblocks={timeblocks}
          disabled={!user}
        />
      ) : (
        <AllAvailabilities plan={plan} timeblocks={timeblocks} />
      )}
    </div>
  );
}
