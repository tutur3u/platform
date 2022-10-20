import type { ReactElement } from 'react';
import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import Layout from '../components/layout/Layout';
import { AuthProtect } from '../hooks/useUser';

const Home: PageWithLayoutProps = () => {
  AuthProtect();

  return <div></div>;
};

Home.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default Home;
