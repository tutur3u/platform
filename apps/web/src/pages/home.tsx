import { ReactElement } from 'react';
import Page from '../components/home/HomePage';
import SidebarLayout from '../components/layouts/SidebarLayout';

const HomePage = () => {
  return <Page />;
};

HomePage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default HomePage;
