'use client';

import { useState } from 'react';
import { Divider } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import useSWR from 'swr';
import CalendarEventCard from '@/components/cards/CalendarEventCard';
import PlusCardButton from '@/components/common/PlusCardButton';
import PaginationIndicator from '@/components/pagination/PaginationIndicator';
import PaginationSelector from '@/components/selectors/PaginationSelector';
import ModeSelector, { Mode } from '@/components/selectors/ModeSelector';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { CalendarEvent } from '@/types/primitives/CalendarEvent';

export default function CalendarEventsPage() {
  const { ws } = useWorkspaces();

  const [query, setQuery] = useState('');
  const [activePage, setPage] = useState(1);

  const [itemsPerPage, setItemsPerPage] = useLocalStorage({
    key: 'calendar-events-items-per-page',
    defaultValue: 15,
  });

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/calendar/events?query=${query}&page=${activePage}&itemsPerPage=${itemsPerPage}`
    : null;

  const { data: events } = useSWR<{
    data: CalendarEvent[];
    count: number;
  }>(apiPath);

  const [mode, setMode] = useLocalStorage<Mode>({
    key: 'calendar-events-mode',
    defaultValue: 'list',
  });

  if (!ws) return null;

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
        <ModeSelector
          setMode={setMode}
          showAll={window.innerWidth > 768}
          mode={window.innerWidth <= 768 ? 'grid' : mode}
        />
        <PaginationSelector
          items={itemsPerPage}
          setItems={(size) => {
            setPage(1);
            setItemsPerPage(size);
          }}
        />
        <div className="hidden xl:block" />
      </div>

      <Divider className="mt-4" />
      <PaginationIndicator totalItems={events?.count} />

      <div
        className={`grid ${
          mode === 'grid' ? 'gap-4 md:grid-cols-2 xl:grid-cols-3' : 'gap-2'
        }`}
      >
        <PlusCardButton href={`/${ws.id}/calendar/events/new`} />

        {events &&
          events?.data.map((e) => (
            <CalendarEventCard
              key={e.id}
              event={e}
              orientation={
                window.innerWidth <= 768
                  ? 'vertical'
                  : mode === 'grid'
                  ? 'vertical'
                  : 'horizontal'
              }
            />
          ))}
      </div>
    </div>
  );
}
