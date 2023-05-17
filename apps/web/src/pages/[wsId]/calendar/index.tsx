import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import HeaderX from '../../../components/metadata/HeaderX';
import Calendar from '../../../components/calendar/Calendar';
import NestedLayout from '../../../components/layouts/NestedLayout';
import { useWorkspaces } from '../../../hooks/useWorkspaces';
import useTranslation from 'next-translate/useTranslation';

const CalendarPage: PageWithLayoutProps = () => {
  const { ws } = useWorkspaces();
  const { setRootSegment } = useSegments();

  const { t } = useTranslation('calendar-tabs');

  const calendarLabel = t('calendar');
  const overviewLabel = t('overview');

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Tổ chức không tên',
              href: `/${ws.id}`,
            },
            { content: calendarLabel, href: `/${ws.id}/calendar` },
            { content: overviewLabel, href: `/${ws.id}/calendar` },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [calendarLabel, overviewLabel, ws, setRootSegment]);

  return (
    <>
      <HeaderX label={`${overviewLabel} – ${calendarLabel}`} />
      <Calendar />
    </>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="infrastructure">{page}</NestedLayout>;
};

export default CalendarPage;
