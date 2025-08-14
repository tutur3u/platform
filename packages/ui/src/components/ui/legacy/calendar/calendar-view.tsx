import { CalendarMatrix } from './calendar-matrix';
import { TimeIndicator } from './time-indicator';
import type { WorkspaceScheduledEventWithAttendees } from '@tuturuuu/types/primitives/RSVP';

export const CalendarView = ({ dates, onOpenEventDetails }: { dates: Date[]; onOpenEventDetails?: (eventId: string, scheduledEvent?: WorkspaceScheduledEventWithAttendees) => void }) => {
  const columns = dates.length;

  // Create a dynamic grid template based on the number of columns
  const gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;

  return (
    <div
      className="relative flex-1"
      style={{
        display: 'grid',
        gridTemplateColumns,
      }}
    >
      <CalendarMatrix dates={dates} onOpenEventDetails={onOpenEventDetails} />
      <TimeIndicator dates={dates} />
    </div>
  );
};
