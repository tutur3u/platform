import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import React from 'react';
import HeaderX from '../components/metadata/HeaderX';
import { showNotification } from '@mantine/notifications';
import { AuthFormFields } from '../utils/auth-handler';
import AuthForm from '../components/auth/AuthForm';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import Image from 'next/image';

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

const LoginPage = () => {
  const supabaseClient = useSupabaseClient();
  const router = useRouter();

  const handleLogin = async ({ email, password }: AuthFormFields) => {
    try {
      if (!password || !email) throw new Error('Please fill in all fields');

      const { authenticate } = await import('../utils/auth-handler');

      await authenticate({
        supabaseClient,
        method: 'login',
        email,
        password,
      });

      const { mutate } = await import('swr');

      mutate('/api/user');
      mutate('/api/workspaces');

      // If there is a redirectedFrom URL, redirect to it
      // Otherwise, redirect to the homepage
      const { redirectedFrom: nextUrl } = router.query;
      router.push(nextUrl ? nextUrl.toString() : '/onboarding');
    } catch (error) {
      showNotification({
        title: 'Error',
        message: typeof error === 'string' ? error : 'Something went wrong',
        color: 'red',
      });
    }
  };

  return (
    <>
      <HeaderX label="Tuturuuu — Log in" />
      <Image
        src="/media/background/auth-featured-bg.jpg"
        alt="Featured background"
        width={1619}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />
      <AuthForm
        title="Welcome back"
        description="Log in to your account"
        submitLabel="Log in"
        submittingLabel="Logging in"
        secondaryAction={{
          description: "Don't have an account?",
          label: 'Sign up',
          href: '/signup',
        }}
        onSubmit={handleLogin}
        disableForgotPassword={false}
        hideForgotPassword={false}
      />
    </>
  );
};

export default LoginPage;
