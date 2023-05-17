import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import HeaderX from '../../../components/metadata/HeaderX';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';

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

  return (
    <>
      <HeaderX label={`${eventsLabel} – ${calendarLabel}`} />
    </>
  );
};

CalendarEventsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="calendar">{page}</NestedLayout>;
};

export default CalendarEventsPage;
