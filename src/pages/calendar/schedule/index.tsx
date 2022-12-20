import { ReactElement, useEffect, useState } from 'react';
import CalendarHeader from '../../../components/calendar/CalendarHeader';
import Layout from '../../../components/layout/Layout';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserData } from '../../../hooks/useUserData';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';

const ScheduleViewPage: PageWithLayoutProps = () => {
  const {
    setRootSegment,
    changeLeftSidebarSecondaryPref,
    disablePadding,
    enablePadding,
  } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('visible');
    disablePadding();

    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });

    return () => {
      enablePadding();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [date, setDate] = useState(new Date());

  const setToday = () => {
    setDate(new Date());
  };

  const setPrevDay = () => {
    setDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1));
  };

  const setNextDay = () => {
    setDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
  };

  // get current month in word
  const month = date.toLocaleString('default', { month: 'long' });

  const title = `${month} ${date.getFullYear()}`;

  return (
    <div className="flex h-full min-h-full w-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <CalendarHeader
        title={title}
        prevHandler={setPrevDay}
        nextHandler={setNextDay}
        todayHandler={setToday}
      />
    </div>
  );
};

ScheduleViewPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default ScheduleViewPage;
