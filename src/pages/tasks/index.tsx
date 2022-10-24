import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';
import { withPageAuth } from '@supabase/auth-helpers-nextjs';

export const getServerSideProps = withPageAuth({
  redirectTo: '/login?nextUrl=/tasks',
});

const AllTasksPage: PageWithLayoutProps = () => {
  return <div></div>;
};

AllTasksPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout label="Tasks">{page}</Layout>;
};

export default AllTasksPage;
