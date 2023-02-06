import { PageWithLayoutProps } from '../types/PageWithLayoutProps';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import { User } from '@supabase/auth-helpers-nextjs';
import dynamic from 'next/dynamic';

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

const AppLayout = dynamic(() => import('../components/layouts/Layout'), {
  loading: () => <div />,
  ssr: false,
});

const Layout = dynamic(() => import('../components/layouts'), {
  loading: () => <div />,
  ssr: false,
});

const HomePage = dynamic(() => import('../components/home/HomePage'));
const LandingPage = dynamic(() => import('../components/home/LandingPage'));

const RootPage: PageWithLayoutProps = ({ user }: { user: User | null }) => {
  if (user)
    return (
      <AppLayout>
        <HomePage />
      </AppLayout>
    );

  return (
    <Layout>
      <LandingPage />
    </Layout>
  );
};

export default RootPage;
