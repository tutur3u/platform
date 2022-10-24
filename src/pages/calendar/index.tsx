import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';

export const getServerSideProps = withPageAuth({
  redirectTo: '/login?nextUrl=/calendar',
});

const CalendarPage: PageWithLayoutProps = () => {
  return (
    <>
      <h1 className="text-4xl font-semibold mb-4">Calendar</h1>
    </>
  );
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default CalendarPage;
