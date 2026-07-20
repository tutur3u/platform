'use client';

import { CalendarListSidebar } from './calendar-list-sidebar';
import { MiniMonthCalendar } from './mini-month-calendar';

export function CalendarSidebarContent({ wsId }: { wsId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MiniMonthCalendar />
      <CalendarListSidebar wsId={wsId} />
    </div>
  );
}
