import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import { ReactElement } from 'react';
import Page from '../components/branding/BrandingPage';
import DefaultLayout from '../components/layouts/DefaultLayout';

const BrandingPage: PageWithLayoutProps = () => {
  return <Page />;
};

BrandingPage.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout hideSlogan>{page}</DefaultLayout>;
};

export default BrandingPage;
