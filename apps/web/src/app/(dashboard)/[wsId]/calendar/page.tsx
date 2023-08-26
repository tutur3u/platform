'use client';

import Calendar from '../../../../components/calendar/Calendar';
import { CalendarProvider } from '../../../../hooks/useCalendar';

export default function CalendarPage() {
  return (
    <CalendarProvider>
      <Calendar />
    </CalendarProvider>
  );
}
