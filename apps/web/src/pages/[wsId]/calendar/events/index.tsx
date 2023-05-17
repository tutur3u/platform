import { ReactElement, useEffect, useState } from 'react';
import { useSegments } from '../../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import HeaderX from '../../../../components/metadata/HeaderX';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';
import { Divider } from '@mantine/core';
import PaginationIndicator from '../../../../components/pagination/PaginationIndicator';
import PlusCardButton from '../../../../components/common/PlusCardButton';
import GeneralSearchBar from '../../../../components/inputs/GeneralSearchBar';
import ModeSelector, {
  Mode,
} from '../../../../components/selectors/ModeSelector';
import PaginationSelector from '../../../../components/selectors/PaginationSelector';
import { useLocalStorage } from '@mantine/hooks';
import GeneralItemCard from '../../../../components/cards/GeneralItemCard';
import { CalendarEvent } from '../../../../types/primitives/CalendarEvent';
import useSWR from 'swr';

const CalendarEventsPage: PageWithLayoutProps = () => {
  const { ws } = useWorkspaces();
  const { setRootSegment } = useSegments();

  const { t } = useTranslation('calendar-tabs');

  const calendarLabel = t('calendar');
  const eventsLabel = t('events');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: calendarLabel, href: `/${ws.id}/calendar` },
            { content: eventsLabel, href: `/${ws.id}/calendar/events` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [calendarLabel, eventsLabel, ws, setRootSegment]);

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
    defaultValue: 'grid',
  });

  if (!ws) return null;

  return (
    <>
      <HeaderX label={`${eventsLabel} – ${calendarLabel}`} />
      <div className="flex min-h-full w-full flex-col pb-20">
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <GeneralSearchBar setQuery={setQuery} />
          <ModeSelector mode={mode} setMode={setMode} />
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
        <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={events?.count}
        />

        <div
          className={`grid gap-4 ${
            mode === 'grid' && 'md:grid-cols-2 xl:grid-cols-4'
          }`}
        >
          <PlusCardButton href={`/${ws.id}/calendar/events/new`} />
          {events &&
            events?.data.map((e: CalendarEvent) => (
              <GeneralItemCard
                key={e.id}
                href={`/${ws.id}/calendar/events/${e.id}`}
                name={e.title}
              />
            ))}
        </div>
      </div>
    </>
  );
};

CalendarEventsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="calendar">{page}</NestedLayout>;
};

export default CalendarEventsPage;
