'use client';

import { useCalendarConnectionsManager } from '@tuturuuu/ui/calendar-app/components/calendar-connections-unified';
import { CalendarListPanel } from '@tuturuuu/ui/calendar-app/components/calendar-list-panel';
import { Separator } from '@tuturuuu/ui/separator';

export function CalendarListSidebar({ wsId }: { wsId: string }) {
  const state = useCalendarConnectionsManager(wsId);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-1 pb-1">
      <Separator className="my-2" />
      <CalendarListPanel state={state} />
    </div>
  );
}
