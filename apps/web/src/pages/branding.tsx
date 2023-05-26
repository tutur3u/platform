import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import { ReactElement } from 'react';
import Page from '../components/branding/BrandingPage';
import DefaultLayout from '../components/layouts/DefaultLayout';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session)
    return {
      redirect: {
        destination: '/onboarding',
        permanent: false,
      },
      props: {
        initialSession: session,
        user: session.user,
      },
    };

  return {
    props: {},
  };
};

const BrandingPage: PageWithLayoutProps = () => {
  return <Page />;
};

BrandingPage.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout hideSlogan>{page}</DefaultLayout>;
};

export default BrandingPage;
