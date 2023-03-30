import { ReactElement, useEffect } from 'react';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import HeaderX from '../../../components/metadata/HeaderX';
import { DEV_MODE } from '../../../constants/common';
import Calendar from '../../../components/calendar/Calendar';
import SidebarLayout from '../../../components/layouts/SidebarLayout';

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
        <div className="p-4 md:h-screen md:p-8">
          <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
            Under construction 🚧
          </div>
        </div>
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
