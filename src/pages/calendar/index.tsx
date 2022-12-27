import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import { ReactElement, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import HeaderX from '../../components/metadata/HeaderX';
import CalendarHeader from '../../components/calendar/CalendarHeader';
import WeekdayBar from '../../components/calendar/WeekdayBar';
import CalendarView from '../../components/calendar/CalendarView';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };

  return {
    props: {
      initialSession: session,
      user: session.user,
    },
  };
};

const CalendarPage: PageWithLayoutProps = () => {
  const {
    setRootSegment,
    changeLeftSidebarSecondaryPref,
    changeRightSidebarPref,
  } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('visible');
    changeRightSidebarPref({
      main: 'closed',
      secondary: 'hidden',
    });

    setRootSegment({
      content: 'Calendar',
      href: '/expenses',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <>
      <HeaderX label="Calendar" />

      <div className="flex h-full w-full flex-col border-zinc-800 bg-zinc-900 p-6">
        <CalendarHeader />
        <WeekdayBar />
        <CalendarView />
      </div>
    </>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
