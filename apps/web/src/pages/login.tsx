import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import React, { ReactElement } from 'react';
import AuthWrapper from '../components/auth/AuthWrapper';
import HeaderX from '../components/metadata/HeaderX';
import DefaultLayout from '../components/layouts/DefaultLayout';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session)
    return {
      redirect: {
        destination: '/',
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

const LoginPage = () => {
  return (
    <>
      <HeaderX label="Login" />
      <AuthWrapper />
    </>
  );
};

LoginPage.getLayout = function getLayout(page: ReactElement) {
  return (
    <DefaultLayout hideNavLinks hideFooter>
      {page}
    </DefaultLayout>
  );
};

export default LoginPage;
