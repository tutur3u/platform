import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components/layout/Layout';
import { AuthProtect } from '../hooks/useUser';
import { APP_VERSION } from '../constants/common';

const Home: PageWithLayoutProps = () => {
  AuthProtect();

  return (
    <div className="flex justify-center items-center">
      <div className="text-3xl font-semibold">Application v{APP_VERSION}</div>
    </div>
  );
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default Home;
