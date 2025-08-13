'use client';

import EventInvitationCard from './event-invitation-card';
import type {
  EventAttendeeStatus,
  EventAttendeeWithUser,
  WorkspaceScheduledEventWithAttendees,
} from '@tuturuuu/types/primitives/RSVP';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  AlertCircle,
  Bell,
  CalendarIcon,
  CheckCircle,
  Clock,
  Users,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useState } from 'react';

interface PendingInvitationsProps {
  wsId: string;
  className?: string;
}

interface PendingInvitation {
  event: WorkspaceScheduledEventWithAttendees;
  attendee: EventAttendeeWithUser;
}

export default function PendingInvitations({
  wsId,
  className,
}: PendingInvitationsProps) {
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'responded'>(
    'pending'
  );

  const loadPendingInvitations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/scheduled-events/invitations`
      );

      if (!response.ok) {
        throw new Error('Failed to load pending invitations');
      }

      const data = await response.json();
      setInvitations(data);
    } catch (error) {
      console.error('Error loading pending invitations:', error);
      toast.error('Failed to load pending invitations');
    } finally {
      setIsLoading(false);
    }
  }, [wsId]);

  useEffect(() => {
    loadPendingInvitations();
  }, [loadPendingInvitations]);

  const handleStatusUpdate = (
    eventId: string,
    newStatus: EventAttendeeStatus
  ) => {
    setInvitations((prev) =>
      prev.map((invitation) =>
        invitation.event.id === eventId
          ? {
              ...invitation,
              attendee: {
                ...invitation.attendee,
                status: newStatus,
                response_at: new Date().toISOString(),
              },
            }
          : invitation
      )
    );
  };

  const getFilteredInvitations = () => {
    switch (filter) {
      case 'pending':
        return invitations.filter((inv) => inv.attendee.status === 'pending');
      case 'responded':
        return invitations.filter((inv) => inv.attendee.status !== 'pending');
      default:
        return invitations;
    }
  };

  const getStats = () => {
    const total = invitations.length;
    const pending = invitations.filter(
      (inv) => inv.attendee.status === 'pending'
    ).length;
    const responded = total - pending;

    return { total, pending, responded };
  };

  const filteredInvitations = getFilteredInvitations();
  const stats = getStats();

  if (isLoading) {
    return (
      <Card className={cn('w-full', className)}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>Event Invitations</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
              <p className="text-muted-foreground">Loading invitations...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>Event Invitations</span>
            {stats.pending > 0 && (
              <Badge variant="destructive" className="ml-2">
                {stats.pending} pending
              </Badge>
            )}
          </CardTitle>

          <Button
            variant="outline"
            size="sm"
            onClick={loadPendingInvitations}
            disabled={isLoading}
          >
            Refresh
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex w-fit space-x-1 rounded-lg bg-muted p-1">
          <Button
            variant={filter === 'pending' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('pending')}
            className="relative"
          >
            <AlertCircle className="mr-1 h-4 w-4" />
            Pending ({stats.pending})
          </Button>

          <Button
            variant={filter === 'responded' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('responded')}
          >
            <CheckCircle className="mr-1 h-4 w-4" />
            Responded ({stats.responded})
          </Button>

          <Button
            variant={filter === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            <Users className="mr-1 h-4 w-4" />
            All ({stats.total})
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {filteredInvitations.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-muted-foreground">
              {filter === 'pending' && stats.pending === 0 && (
                <>
                  <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
                  <p className="mb-2 text-lg font-medium">All caught up!</p>
                  <p>You have no pending event invitations.</p>
                </>
              )}

              {filter === 'responded' && stats.responded === 0 && (
                <>
                  <Clock className="mx-auto mb-4 h-12 w-12" />
                  <p className="mb-2 text-lg font-medium">No responses yet</p>
                  <p>You haven&apos;t responded to any invitations.</p>
                </>
              )}

              {filter === 'all' && stats.total === 0 && (
                <>
                  <CalendarIcon className="mx-auto mb-4 h-12 w-12" />
                  <p className="mb-2 text-lg font-medium">No invitations</p>
                  <p>
                    You don&apos;t have any event invitations at the moment.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <ScrollArea className="h-[600px] pr-4">
            <div className="space-y-4">
              {filteredInvitations.map((invitation) => (
                <div key={invitation.event.id}>
                  <EventInvitationCard
                    event={invitation.event}
                    attendee={invitation.attendee}
                    wsId={wsId}
                    onStatusUpdate={handleStatusUpdate}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Quick Stats */}
        {stats.total > 0 && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center space-x-4">
                <span>{stats.total} total invitations</span>
                <span>•</span>
                <span>{stats.responded} responded</span>
                <span>•</span>
                <span>{stats.pending} pending</span>
              </div>

              {stats.pending > 0 && (
                <div className="flex items-center space-x-1 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>Action needed</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
