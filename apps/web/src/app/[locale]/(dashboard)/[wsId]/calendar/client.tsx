'use client';

import AddEventButton from './components/add-event-button';
import AddEventDialog from './components/add-event-dialog';
import AutoScheduleComprehensiveDialog from './components/auto-schedule-comprehensive-dialog';
import CreateScheduledEventButton from './components/create-scheduled-event-button';
import EventDetailsDialog from './components/event-details-dialog';
import TestEventGeneratorButton from './components/test-event-generator-button';
import { DEV_MODE } from '@/constants/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Workspace,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types/db';
import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';
import { Button } from '@tuturuuu/ui/button';
import { Sparkles } from '@tuturuuu/ui/icons';
import { SmartCalendar } from '@tuturuuu/ui/legacy/calendar/smart-calendar';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from '@tuturuuu/ui/sonner';

export default function CalendarClientPage({
  experimentalGoogleToken,
  workspace,
}: {
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  workspace: Workspace;
}) {
  const t = useTranslations('calendar');
  const locale = useLocale();
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);
  const [eventDetailsDialog, setEventDetailsDialog] = useState<{
    isOpen: boolean;
    event: WorkspaceScheduledEventWithAttendees | null;
    isLoading?: boolean;
  }>({
    isOpen: false,
    event: null,
    isLoading: false,
  });

  const fetchEventDetails = async (eventId: string, scheduledEvent?: WorkspaceScheduledEventWithAttendees) => {
    // If we already have the event data, use it directly
    if (scheduledEvent) {
      setEventDetailsDialog({ isOpen: true, event: scheduledEvent, isLoading: false });
      return;
    }
    
    // Otherwise, fetch the event data
    setEventDetailsDialog({ isOpen: true, event: null, isLoading: true });
    
    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspace.id}/scheduled-events/${eventId}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch event details');
      }
      
      const event = await response.json();
      setEventDetailsDialog({ isOpen: true, event, isLoading: false });
    } catch (error) {
      toast.error('Error fetching event details:');
      console.error('Error fetching event details:', error);
      setEventDetailsDialog({ isOpen: false, event: null, isLoading: false });
      // Optionally show a toast error message here
    }
  };

  const extras =
    workspace.id === ROOT_WORKSPACE_ID ? (
      <div className="grid w-full items-center gap-2 md:flex md:w-auto">
        <AddEventButton onOpenDialog={() => setIsAddEventDialogOpen(true)} />
        <CreateScheduledEventButton wsId={workspace.id} />
        {DEV_MODE && <TestEventGeneratorButton wsId={workspace.id} />}
        <AutoScheduleComprehensiveDialog wsId={workspace.id}>
          <Button
            variant="default"
            size="sm"
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 md:w-fit"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Auto-Schedule
          </Button>
        </AutoScheduleComprehensiveDialog>
      </div>
    ) : undefined;

  return (
    <>
      <SmartCalendar
        t={t}
        locale={locale}
        workspace={workspace}
        useQuery={useQuery}
        useQueryClient={useQueryClient}
        experimentalGoogleToken={
          experimentalGoogleToken?.ws_id === workspace.id
            ? experimentalGoogleToken
            : null
        }
        extras={extras}
        onOpenEventDetails={fetchEventDetails}
      />
      <AddEventDialog
        wsId={workspace.id}
        isOpen={isAddEventDialogOpen}
        onClose={() => setIsAddEventDialogOpen(false)}
      />
      {(eventDetailsDialog.event || eventDetailsDialog.isLoading) && (
        <EventDetailsDialog
          isOpen={eventDetailsDialog.isOpen}
          onClose={() => setEventDetailsDialog({ isOpen: false, event: null, isLoading: false })}
          event={eventDetailsDialog.event}
          isLoading={eventDetailsDialog.isLoading}
          wsId={workspace.id}
        />
      )}
    </>
  );
}
