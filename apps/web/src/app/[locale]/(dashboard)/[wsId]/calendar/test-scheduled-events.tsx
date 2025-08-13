'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { useCurrentUser } from '@tuturuuu/ui/hooks/use-current-user';
import { Check, Clock, HelpCircle, X } from '@tuturuuu/ui/icons';
import { useState } from 'react';

export const TestScheduledEvents = () => {
  const { scheduledEvents, refreshScheduledEvents } = useCalendarSync();
  const { userId } = useCurrentUser();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const handleStatusUpdate = async (
    eventId: string,
    status: 'accepted' | 'declined' | 'tentative'
  ) => {
    if (!userId) return;

    setIsUpdating(eventId);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${window.location.pathname.split('/')[2]}/scheduled-events/${eventId}/attendees/respond`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        }
      );

      if (response.ok) {
        await refreshScheduledEvents();
      } else {
        console.error('Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setIsUpdating(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'tentative':
        return <HelpCircle className="h-4 w-4 text-yellow-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-600" />;
      case 'declined':
        return <X className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800">
            Accepted
          </Badge>
        );
      case 'tentative':
        return (
          <Badge variant="default" className="bg-yellow-100 text-yellow-800">
            Tentative
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="default" className="bg-gray-100 text-gray-800">
            Pending
          </Badge>
        );
      case 'declined':
        return (
          <Badge variant="default" className="bg-red-100 text-red-800">
            Declined
          </Badge>
        );
      default:
        return (
          <Badge variant="default" className="bg-gray-100 text-gray-800">
            Unknown
          </Badge>
        );
    }
  };

  if (!userId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Test Scheduled Events</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Loading user...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Test Scheduled Events
          <Button onClick={refreshScheduledEvents} size="sm">
            Refresh
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {scheduledEvents.length === 0 ? (
            <p className="text-muted-foreground">No scheduled events found.</p>
          ) : (
            scheduledEvents.map((event) => {
              const userAttendee = event.attendees?.find(
                (a) => a.user_id === userId
              );
              const currentStatus = userAttendee?.status || 'pending';
              const isCreator = event.creator_id === userId;

              return (
                <div key={event.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium">{event.title}</h3>
                      {event.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(currentStatus)}
                      {getStatusBadge(currentStatus)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Start:</span>{' '}
                      {new Date(event.start_at).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">End:</span>{' '}
                      {new Date(event.end_at).toLocaleString()}
                    </div>
                    {event.location && (
                      <div>
                        <span className="font-medium">Location:</span>{' '}
                        {event.location}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Creator:</span>{' '}
                      {event.creator?.display_name || 'Unknown'}
                    </div>
                  </div>

                  {event.attendee_count && (
                    <div className="flex gap-2 text-sm">
                      <Badge variant="outline">
                        {event.attendee_count.accepted} accepted
                      </Badge>
                      <Badge variant="outline">
                        {event.attendee_count.pending} pending
                      </Badge>
                      <Badge variant="outline">
                        {event.attendee_count.tentative} tentative
                      </Badge>
                      <Badge variant="outline">
                        {event.attendee_count.declined} declined
                      </Badge>
                    </div>
                  )}

                  {!isCreator && userAttendee && (
                    <div className="flex gap-2">
                      {currentStatus !== 'accepted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-200 bg-green-50 hover:bg-green-100"
                          onClick={() =>
                            handleStatusUpdate(event.id, 'accepted')
                          }
                          disabled={isUpdating === event.id}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Accept
                        </Button>
                      )}
                      {currentStatus !== 'tentative' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-yellow-200 bg-yellow-50 hover:bg-yellow-100"
                          onClick={() =>
                            handleStatusUpdate(event.id, 'tentative')
                          }
                          disabled={isUpdating === event.id}
                        >
                          <HelpCircle className="mr-1 h-4 w-4" />
                          Maybe
                        </Button>
                      )}
                      {currentStatus !== 'declined' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 bg-red-50 hover:bg-red-100"
                          onClick={() =>
                            handleStatusUpdate(event.id, 'declined')
                          }
                          disabled={isUpdating === event.id}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Decline
                        </Button>
                      )}
                    </div>
                  )}

                  {isCreator && (
                    <p className="text-sm text-muted-foreground">
                      You created this event
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};
