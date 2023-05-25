import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import { ReactElement } from 'react';
import Page from '../components/home/LandingPage';
import DefaultLayout from '../components/layouts/DefaultLayout';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createPagesServerClient(ctx);

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

const LandingPage: PageWithLayoutProps = () => {
  return <Page />;
};

LandingPage.getLayout = function getLayout(page: ReactElement) {
  return <DefaultLayout>{page}</DefaultLayout>;
};

export default LandingPage;
