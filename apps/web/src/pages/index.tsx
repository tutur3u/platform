import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import { ReactElement } from 'react';
import Page from '../components/home/LandingPage';
import DefaultLayout from '../components/layouts/DefaultLayout';

const LandingPage: PageWithLayoutProps = () => {
  return <Page />;
};

LandingPage.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout>{page}</DefaultLayout>;
};

export default LandingPage;
