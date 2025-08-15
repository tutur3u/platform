'use client';

import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';
import { Button } from '@tuturuuu/ui/button';
import { Check, Clock, HelpCircle, X } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

interface ScheduledEventQuickActionsProps { 
  scheduledEvent: WorkspaceScheduledEventWithAttendees;
  userId: string;
  onStatusUpdate: (
    eventId: string,
    status: 'accepted' | 'declined' | 'tentative'
  ) => Promise<void>;
  className?: string;
  compact?: boolean;
}

export const ScheduledEventQuickActions = ({
  scheduledEvent,
  userId,
  onStatusUpdate,
  className,
  compact = false,
}: ScheduledEventQuickActionsProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const userAttendee = scheduledEvent.attendees?.find(
    (a) => a.user_id === userId
  );
  const currentStatus = userAttendee?.status || 'pending';

  const handleStatusUpdate = async (
    status: 'accepted' | 'declined' | 'tentative'
  ) => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      await onStatusUpdate(scheduledEvent.id, status);
    } finally {
      setIsUpdating(false);
    }
  };


  // Don't show actions if user is not an attendee
  if (!userAttendee) {
    return null;
  }

  if (compact) {
    // Compact view - just show status indicator
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {currentStatus === 'accepted' && (
          <Check className="h-3 w-3 text-green-600" />
        )}
        {currentStatus === 'tentative' && (
          <HelpCircle className="h-3 w-3 text-yellow-600" />
        )}
        {currentStatus === 'pending' && (
          <Clock className="h-3 w-3 text-gray-600" />
        )}
        {currentStatus === 'declined' && <X className="h-3 w-3 text-red-600" />}
      </div>
    );
  }

  // Full view - show action buttons
  return (
    <div className={cn('flex gap-1', className)}>
      {currentStatus !== 'accepted' && (
        <Button
          size="sm"
          variant="outline"
          className="bg-dynamic-green-50 hover:bg-dynamic-green-100 h-6 border-green-200 px-2 text-xs"
          onClick={() => handleStatusUpdate('accepted')}
          disabled={isUpdating}
        >
          <Check className="mr-1 h-3 w-3" />
          Accept
        </Button>
      )}
      {currentStatus !== 'tentative' && (
        <Button
          size="sm"
          variant="outline"
          className="bg-dynamic-yellow-50 hover:bg-dynamic-yellow-100 h-6 border-yellow-200 px-2 text-xs"
          onClick={() => handleStatusUpdate('tentative')}
          disabled={isUpdating}
        >
          <HelpCircle className="mr-1 h-3 w-3" />
          Maybe
        </Button>
      )}
      {currentStatus !== 'declined' && (
        <Button
          size="sm"
          variant="outline"
          className="bg-dynamic-red-50 hover:bg-dynamic-red-100 h-6 border-red-200 px-2 text-xs"
          onClick={() => handleStatusUpdate('declined')}
          disabled={isUpdating}
        >
          <X className="mr-1 h-3 w-3" />
          Decline
        </Button>
      )}
    </div>
  );
};
