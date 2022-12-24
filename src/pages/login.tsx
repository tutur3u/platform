import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import React from 'react';
import AuthWrapper from '../components/auth/AuthWrapper';
import HeaderX from '../components/metadata/HeaderX';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session)
    return {
      redirect: {
        destination: '/calendar',
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

export default LoginPage;
