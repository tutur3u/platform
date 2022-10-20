import { APP_VERSION } from '../constants/common';

import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components/layout/Layout';
import { AuthProtect } from '../hooks/useUser';

const Home: PageWithLayoutProps = () => {
  AuthProtect();

  return (
    <div className="text-blue-200 flex items-center justify-center text-3xl font-semibold">
      Application v{APP_VERSION}
    </div>
  );
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default Home;
