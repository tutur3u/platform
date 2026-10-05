'use client';
import { isProviderRecurrenceReadonly } from '@tuturuuu/utils/calendar-provider-readonly';
import { useCalendar } from '../../../../hooks/use-calendar';
import { LegacyEventModal } from './legacy-event-modal';
import { NativeRecurrenceDialog } from './native-recurrence-dialog';
import { ProviderReadonlyDialog } from './provider-readonly-dialog';
export function EventModal() {
  const { activeEvent, isModalOpen, closeModal, readOnly } = useCalendar();
  if (activeEvent && isProviderRecurrenceReadonly(activeEvent))
    return (
      <ProviderReadonlyDialog
        event={activeEvent}
        open={isModalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      />
    );
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
