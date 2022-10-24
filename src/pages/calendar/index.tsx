import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';

export const getServerSideProps = withPageAuth({
  redirectTo: '/login?nextUrl=/calendar',
});

const CalendarPage: PageWithLayoutProps = () => {
  return <div></div>;
};

CalendarPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout label="Calendar">{page}</Layout>;
};

export default CalendarPage;
