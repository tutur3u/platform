'use client';
import { useCalendar } from '../../../../hooks/use-calendar';
import { LegacyEventModal } from './legacy-event-modal';
import { NativeRecurrenceDialog } from './native-recurrence-dialog';
export function EventModal() {
  const { activeEvent, isModalOpen, closeModal, readOnly } = useCalendar();
  if (!activeEvent?.seriesId) return <LegacyEventModal />;
  return (
    <NativeRecurrenceDialog
      wsId={activeEvent.ws_id ?? ''}
      open={isModalOpen}
      onOpenChange={(open) => {
        if (!open) closeModal();
      }}
      occurrence={activeEvent}
      readOnly={readOnly}
    />
  );
}
