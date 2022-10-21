import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import Layout from '../../components/layout/Layout';

const AllTasksPage: PageWithLayoutProps = () => {
  return (
    <div className="flex justify-center items-center">
      <div className="text-3xl font-semibold">All tasks page</div>
    </div>
  );
};

AllTasksPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default AllTasksPage;
