'use client';

import type {
  EventAttendeeStatus,
  EventAttendeeWithUser,
  WorkspaceScheduledEventWithAttendees,
} from '@tuturuuu/types/primitives/RSVP';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  CalendarIcon,
  Check,
  Clock,
  MapPin,
  User,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useCallback, useState } from 'react';

interface EventInvitationCardProps {
  event: WorkspaceScheduledEventWithAttendees;
  attendee: EventAttendeeWithUser;
  wsId: string;
  onStatusUpdate?: (eventId: string, newStatus: EventAttendeeStatus) => void;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending Response',
    color: 'bg-yellow-100 text-yellow-800',
    icon: Clock,
  },
  accepted: {
    label: 'Accepted',
    color: 'bg-green-100 text-green-800',
    icon: Check,
  },
  declined: {
    label: 'Declined',
    color: 'bg-red-100 text-red-800',
    icon: X,
  },
  tentative: {
    label: 'Tentative',
    color: 'bg-blue-100 text-blue-800',
    icon: Clock,
  },
} as const;

export default function EventInvitationCard({
  event,
  attendee,
  wsId,
  onStatusUpdate,
}: EventInvitationCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(attendee.status);

  const handleStatusUpdate = async (newStatus: EventAttendeeStatus) => {
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/scheduled-events/${event.id}/attendees/respond`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update attendance status');
      }

      setCurrentStatus(newStatus);
      toast.success(`Response updated: ${STATUS_CONFIG[newStatus].label}`);

      // Call the parent callback if provided
      onStatusUpdate?.(event.id, newStatus);
    } catch (error) {
      console.error('Error updating attendance status:', error);
      toast.error('Failed to update response. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatEventTime = useCallback(() => {
    if (event.is_all_day) {
      const startDate = new Date(event.start_at);
      const endDate = new Date(event.end_at);

      if (format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
        return `All day on ${format(startDate, 'PPP')}`;
      } else {
        return `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')} (All day)`;
      }
    } else {
      return `${format(new Date(event.start_at), 'PPP p')} - ${format(new Date(event.end_at), 'p')}`;
    }
  }, [event.is_all_day, event.start_at, event.end_at]);

  const StatusIcon = STATUS_CONFIG[currentStatus].icon;

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="text-xl">{event.title}</CardTitle>
            <Badge className={cn('w-fit', STATUS_CONFIG[currentStatus].color)}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {STATUS_CONFIG[currentStatus].label}
            </Badge>
          </div>

          {event.creator && (
            <div className="flex items-center space-x-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Created by {event.creator.display_name || 'Unknown'}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Event Description */}
        {event.description && (
          <div>
            <p className="text-sm text-muted-foreground">{event.description}</p>
          </div>
        )}

        {/* Event Details */}
        <div className="space-y-3">
          {/* Date and Time */}
          <div className="flex items-center space-x-3">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{formatEventTime()}</span>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-center space-x-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{event.location}</span>
            </div>
          )}

          {/* Attendee Count */}
          {event.attendee_count && (
            <div className="flex items-center space-x-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {event.attendee_count.total} invited •{' '}
                {event.attendee_count.accepted} accepted •{' '}
                {event.attendee_count.declined} declined •{' '}
                {event.attendee_count.pending} pending
              </span>
            </div>
          )}
        </div>

        {/* Response History */}
        {attendee.response_at && (
          <div className="text-xs text-muted-foreground">
            Last updated: {format(new Date(attendee.response_at), 'PPP p')}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col space-y-3">
        {/* Action Buttons */}
        <div className="flex w-full flex-wrap gap-2">
          <Button
            variant={currentStatus === 'accepted' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusUpdate('accepted')}
            disabled={isLoading || currentStatus === 'accepted'}
            className={cn(
              'min-w-[100px] flex-1',
              currentStatus === 'accepted' && 'bg-green-600 hover:bg-green-700'
            )}
          >
            <Check className="mr-1 h-4 w-4" />
            Accept
          </Button>

          <Button
            variant={currentStatus === 'tentative' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusUpdate('tentative')}
            disabled={isLoading || currentStatus === 'tentative'}
            className={cn(
              'min-w-[100px] flex-1',
              currentStatus === 'tentative' && 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            <Clock className="mr-1 h-4 w-4" />
            Maybe
          </Button>

          <Button
            variant={currentStatus === 'declined' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusUpdate('declined')}
            disabled={isLoading || currentStatus === 'declined'}
            className={cn(
              'min-w-[100px] flex-1',
              currentStatus === 'declined' && 'bg-red-600 hover:bg-red-700'
            )}
          >
            <X className="mr-1 h-4 w-4" />
            Decline
          </Button>
        </div>

        {/* Help Text */}
        <p className="text-center text-xs text-muted-foreground">
          {currentStatus === 'pending'
            ? 'Please respond to help the organizer plan accordingly'
            : `You ${currentStatus} this event. You can change your response anytime.`}
        </p>
      </CardFooter>
    </Card>
  );
}
