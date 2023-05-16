import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import HeaderX from '../../../components/metadata/HeaderX';
import { DEV_MODE } from '../../../constants/common';
import Calendar from '../../../components/calendar/Calendar';
import NestedLayout from '../../../components/layouts/NestedLayout';

const CalendarPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();

  useEffect(() => {
    setRootSegment({
      content: 'Calendar',
      href: '/calendar',
    });
  }, [setRootSegment]);

  return (
    <>
      <HeaderX label="Calendar" />
      <Calendar />
    </>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout>{page}</NestedLayout>;
};

export default CalendarPage;
