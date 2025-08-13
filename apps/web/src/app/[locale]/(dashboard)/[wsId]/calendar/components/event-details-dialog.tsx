'use client';

import type {
  EventAttendeeStatus,
  EventAttendeeWithUser,
  WorkspaceScheduledEventWithAttendees,
} from '@tuturuuu/types/primitives/RSVP';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  CalendarIcon,
  Check,
  Clock,
  Edit,
  Mail,
  MapPin,
  Trash2,
  User,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

interface EventDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  wsId: string;
  onEventUpdate?: (eventId: string) => void;
  onEventDelete?: (eventId: string) => void;
}

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: Clock,
  },
  accepted: {
    label: 'Accepted',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: Check,
  },
  declined: {
    label: 'Declined',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: X,
  },
  tentative: {
    label: 'Tentative',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Clock,
  },
} as const;

export default function EventDetailsDialog({
  isOpen,
  onClose,
  eventId,
  wsId,
  onEventDelete,
}: EventDetailsDialogProps) {
  const [event, setEvent] =
    useState<WorkspaceScheduledEventWithAttendees | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEventDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/scheduled-events/${eventId}`
      );

      if (!response.ok) {
        throw new Error('Failed to load event details');
      }

      const eventData = await response.json();
      setEvent(eventData);
    } catch (error) {
      console.error('Error loading event details:', error);
      toast.error('Failed to load event details');
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [eventId, wsId, onClose]);

  // Load event details when dialog opens
  useEffect(() => {
    if (isOpen && eventId) {
      loadEventDetails();
    }
  }, [isOpen, eventId, loadEventDetails]);

  const handleDeleteEvent = useCallback(async () => {
    if (
      !event ||
      !confirm(
        'Are you sure you want to delete this event? This action cannot be undone.'
      )
    ) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/scheduled-events/${eventId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete event');
      }

      toast.success('Event deleted successfully');
      onEventDelete?.(eventId);
      onClose();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast.error('Failed to delete event. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }, [eventId, wsId, onEventDelete, onClose, event]);

  // TODO: Implement resend invitations functionality
  const handleResendInvitations = useCallback(async () => {
    toast.info('Resend invitations feature coming soon');
  }, []);

  const formatEventTime = useCallback(
    (event: WorkspaceScheduledEventWithAttendees) => {
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
    },
    []
  );

  const getAttendeesByStatus = useCallback(
    (status: EventAttendeeStatus) => {
      return (
        event?.attendees?.filter((attendee) => attendee.status === status) || []
      );
    },
    [event?.attendees]
  );

  const getStatusStats = useCallback(() => {
    if (!event?.attendee_count) return null;

    const { total, accepted, declined, pending, tentative } =
      event.attendee_count;
    return {
      total,
      accepted,
      declined,
      pending,
      tentative,
      responseRate:
        total > 0
          ? Math.round(((accepted + declined + tentative) / total) * 100)
          : 0,
    };
  }, [event?.attendee_count]);

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
              <p className="text-muted-foreground">Loading event details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!event) {
    return null;
  }

  const stats = getStatusStats();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <DialogTitle className="text-2xl">{event.title}</DialogTitle>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                {event.creator && (
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4" />
                    <span>
                      Created by {event.creator.display_name || 'Unknown'}
                    </span>
                  </div>
                )}
                <div>
                  Created {format(new Date(event.created_at || ''), 'PPP')}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" disabled>
                <Edit className="mr-1 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteEvent}
                disabled={isDeleting}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Event Description */}
          {event.description && (
            <div>
              <p className="text-muted-foreground">{event.description}</p>
            </div>
          )}

          {/* Event Details */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                <span>{formatEventTime(event)}</span>
              </div>

              {event.location && (
                <div className="flex items-center space-x-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <span>{event.location}</span>
                </div>
              )}
            </div>

            {/* Response Statistics */}
            {stats && (
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <span>{stats.total} people invited</span>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-sm text-muted-foreground">
                    Response Rate:
                  </div>
                  <Badge variant="outline">{stats.responseRate}%</Badge>
                </div>

                <div className="flex space-x-2 text-xs">
                  <Badge className={STATUS_CONFIG.accepted.color}>
                    {stats.accepted} Accepted
                  </Badge>
                  <Badge className={STATUS_CONFIG.declined.color}>
                    {stats.declined} Declined
                  </Badge>
                  <Badge className={STATUS_CONFIG.tentative.color}>
                    {stats.tentative} Tentative
                  </Badge>
                  <Badge className={STATUS_CONFIG.pending.color}>
                    {stats.pending} Pending
                  </Badge>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Attendees Management */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Attendees</h3>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendInvitations}
                >
                  <Mail className="mr-1 h-4 w-4" />
                  Resend Invitations
                </Button>
              </div>
            </div>

            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">All ({stats?.total || 0})</TabsTrigger>
                <TabsTrigger value="accepted">
                  Accepted ({stats?.accepted || 0})
                </TabsTrigger>
                <TabsTrigger value="tentative">
                  Tentative ({stats?.tentative || 0})
                </TabsTrigger>
                <TabsTrigger value="declined">
                  Declined ({stats?.declined || 0})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Pending ({stats?.pending || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                <AttendeesList attendees={event.attendees || []} />
              </TabsContent>

              <TabsContent value="accepted" className="mt-4">
                <AttendeesList attendees={getAttendeesByStatus('accepted')} />
              </TabsContent>

              <TabsContent value="tentative" className="mt-4">
                <AttendeesList attendees={getAttendeesByStatus('tentative')} />
              </TabsContent>

              <TabsContent value="declined" className="mt-4">
                <AttendeesList attendees={getAttendeesByStatus('declined')} />
              </TabsContent>

              <TabsContent value="pending" className="mt-4">
                <AttendeesList attendees={getAttendeesByStatus('pending')} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Attendees List Component
function AttendeesList({ attendees }: { attendees: EventAttendeeWithUser[] }) {
  if (attendees.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No attendees in this category
      </div>
    );
  }

  return (
    <ScrollArea className="h-64">
      <div className="space-y-2">
        {attendees.map((attendee) => {
          const StatusIcon = STATUS_CONFIG[attendee.status].icon;

          return (
            <div
              key={attendee.id}
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
            >
              <div className="flex items-center space-x-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={attendee.user?.avatar_url || ''} />
                  <AvatarFallback>
                    {attendee.user?.display_name?.charAt(0)?.toUpperCase() ||
                      'U'}
                  </AvatarFallback>
                </Avatar>

                <div>
                  <div className="font-medium">
                    {attendee.user?.display_name || 'Unknown User'}
                  </div>
                </div>
              </div>

              <Badge
                className={cn('border', STATUS_CONFIG[attendee.status].color)}
              >
                <StatusIcon className="mr-1 h-3 w-3" />
                {STATUS_CONFIG[attendee.status].label}
              </Badge>

              {attendee.response_at && (
                <div className="text-xs text-muted-foreground">
                  {format(new Date(attendee.response_at), 'MMM d, p')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
