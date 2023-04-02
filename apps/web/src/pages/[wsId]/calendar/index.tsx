import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import HeaderX from '../../../components/metadata/HeaderX';
import { DEV_MODE } from '../../../constants/common';
import Calendar from '../../../components/calendar/Calendar';
import SidebarLayout from '../../../components/layouts/SidebarLayout';
import UnderConstructionTag from '../../../components/common/UnderConstructionTag';

const CalendarPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment({
      content: 'Calendar',
      href: '/calendar',
    });
  }, [setRootSegment]);

  if (!DEV_MODE)
    return (
      <>
        <HeaderX label="Calendar" />
        <UnderConstructionTag />
      </>
    );

  return (
    <>
      <HeaderX label="Calendar" />
      <Calendar />
    </>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default CalendarPage;
