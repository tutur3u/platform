import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import React, { useState } from 'react';
import HeaderX from '../components/metadata/HeaderX';
import { showNotification } from '@mantine/notifications';
import { AuthFormFields } from '../utils/auth-handler';
import AuthForm from '../components/auth/AuthForm';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Image from 'next/image';
import useTranslation from 'next-translate/useTranslation';
import { mutate } from 'swr';
import AuthEmailSent from '../components/auth/AuthEmailSent';

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

const SignupPage = () => {
  const supabaseClient = useSupabaseClient();

  const [email, setEmail] = useState<string | null>(null);

  const handleSignup = async ({ email, password }: AuthFormFields) => {
    try {
      if (!password || !email) throw new Error('Please fill in all fields');

      const { authenticate } = await import('../utils/auth-handler');

      await authenticate({
        supabaseClient,
        method: 'signup',
        email,
        password,
      });

      setEmail(email);

      mutate('/api/user');
      mutate('/api/workspaces/current');
    } catch (e) {
      if (e instanceof Error)
        showNotification({
          title: 'Error',
          message: e?.message || 'Something went wrong',
          color: 'red',
        });
      else
        showNotification({
          title: 'Error',
          message: `${e}` || 'Something went wrong',
          color: 'red',
        });
    }
  };

  const { t } = useTranslation('signup');

  const signup = t('signup');
  const signingUp = t('signing-up');

  const login = t('login');

  const getStarted = t('get-started');
  const getStartedDesc = t('get-started-desc');

  const alreadyHaveAccount = t('already-have-account');

  return (
    <>
      <HeaderX label={`Tuturuuu — ${signup}`} />
      <Image
        src="/media/background/auth-featured-bg.jpg"
        alt="Featured background"
        width={1619}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />

      {email ? (
        <AuthEmailSent email={email} />
      ) : (
        <AuthForm
          title={getStarted}
          description={getStartedDesc}
          submitLabel={signup}
          submittingLabel={signingUp}
          secondaryAction={{
            description: alreadyHaveAccount,
            label: login,
            href: '/login',
          }}
          onSubmit={handleSignup}
          disableForgotPassword={false}
          hideForgotPassword
        />
      )}
    </>
  );
};

export default SignupPage;
