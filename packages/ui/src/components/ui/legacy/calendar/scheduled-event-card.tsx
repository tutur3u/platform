'use client';

import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { Button } from '@tuturuuu/ui/button';
import { Check, Clock, HelpCircle, X } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

interface ScheduledEventCardProps {
  event: CalendarEvent;
  scheduledEvent: WorkspaceScheduledEventWithAttendees;
  userId: string;
  onStatusUpdate: (
    eventId: string,
    status: 'accepted' | 'declined' | 'tentative'
  ) => Promise<void>;
  className?: string;
}

export const ScheduledEventCard = ({
  event,
  scheduledEvent,
  userId,
  onStatusUpdate,
  className,
}: ScheduledEventCardProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const isCreator = scheduledEvent.creator_id === userId;
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

  const getStatusColor = () => {
    switch (currentStatus) {
      case 'accepted':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'tentative':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'pending':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'declined':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = () => {
    switch (currentStatus) {
      case 'accepted':
        return <Check className="h-3 w-3" />;
      case 'tentative':
        return <HelpCircle className="h-3 w-3" />;
      case 'pending':
        return <Clock className="h-3 w-3" />;
      case 'declined':
        return <X className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getStatusText = () => {
    switch (currentStatus) {
      case 'accepted':
        return 'Accepted';
      case 'tentative':
        return 'Tentative';
      case 'pending':
        return 'Pending';
      case 'declined':
        return 'Declined';
      default:
        return 'Pending';
    }
  };

  return (
    <div
      className={cn(
        'group relative rounded-md border p-2 text-xs transition-all hover:shadow-sm',
        getStatusColor(),
        className
      )}
    >
      {/* Event title and status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{event.title}</div>
          {event.location && (
            <div className="truncate text-xs opacity-75">{event.location}</div>
          )}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1 text-xs">
          {getStatusIcon()}
          <span className="hidden sm:inline">{getStatusText()}</span>
        </div>
      </div>

      {/* Attendee count */}
      {scheduledEvent.attendee_count && (
        <div className="mt-1 text-xs opacity-75">
          {scheduledEvent.attendee_count.accepted} accepted
          {scheduledEvent.attendee_count.pending > 0 &&
            `, ${scheduledEvent.attendee_count.pending} pending`}
        </div>
      )}

      {/* Quick action buttons for attendees */}
      {!isCreator && userAttendee && currentStatus === 'pending' && (
        <div className="mt-2 flex gap-1">
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
        </div>
      )}

      {/* Status change buttons for other statuses */}
      {!isCreator && userAttendee && currentStatus !== 'pending' && (
        <div className="mt-2 flex gap-1">
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
      )}

      {/* Creator indicator */}
      {isCreator && (
        <div className="mt-2 text-xs opacity-75">You created this event</div>
      )}
    </div>
  );
};
