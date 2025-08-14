'use client';

import CreateScheduledEventDialog from './create-scheduled-event-dialog';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Button } from '@tuturuuu/ui/button';
import { Users } from '@tuturuuu/ui/icons';
import { useState } from 'react';

interface CreateScheduledEventButtonProps {
  wsId: string;
}

export default function CreateScheduledEventButton({
  wsId,
}: CreateScheduledEventButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { refreshScheduledEvents } = useCalendarSync();

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    refreshScheduledEvents();
  };

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        className="bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
        size="sm"
      >
        <Users className="mr-2 h-4 w-4" />
        Schedule Event
      </Button>

      <CreateScheduledEventDialog
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        wsId={wsId}
      />
    </>
  );
}
