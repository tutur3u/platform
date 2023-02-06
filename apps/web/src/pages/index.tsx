import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import { User } from '@supabase/auth-helpers-nextjs';
import dynamic from 'next/dynamic';
import { ReactElement } from 'react';
import Layout from '../components/layouts/Layout';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    props: {
      initialSession: session,
      user: session?.user ?? null,
    },
  };
};

const HomePage = dynamic(() => import('../components/home/HomePage'), {
  ssr: false,
});

const LandingPage = dynamic(() => import('../components/home/LandingPage'), {
  ssr: false,
});

const RootPage: PageWithLayoutProps = ({ user }: { user: User | null }) => {
  if (user) return <HomePage />;
  return <LandingPage />;
};

RootPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default RootPage;
