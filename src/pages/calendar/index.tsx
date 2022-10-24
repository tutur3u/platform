import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';

export const getServerSideProps = withPageAuth({ redirectTo: '/login' });

const CalendarPage: PageWithLayoutProps = () => {
  return (
    <div className="flex justify-center items-center">
      <div className="text-3xl font-semibold">Calendar</div>
    </div>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
