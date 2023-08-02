import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import React, { useState } from 'react';
import HeaderX from '../components/metadata/HeaderX';
import { showNotification } from '@mantine/notifications';
import { AuthFormFields, AuthMethod } from '../utils/auth-handler';
import AuthForm, { AuthFormMode } from '../components/auth/AuthForm';
import {
  SupabaseClient,
  useSupabaseClient,
} from '@supabase/auth-helpers-react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import useTranslation from 'next-translate/useTranslation';
import { mutate } from 'swr';

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

const LoginPage = () => {
  const supabaseClient = useSupabaseClient();
  const router = useRouter();

  const method = 'login';
  const steps = [1, 2];

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<
    AuthFormMode.AuthWithOTP | AuthFormMode.AuthWithPassword
  >(AuthFormMode.AuthWithOTP);

  const handleSendOTP = async ({ email }: AuthFormFields) => {
    try {
      if (!email) throw new Error('Please fill in all fields');

      const { sendOTP } = await import('../utils/auth-handler');
      await sendOTP({ email });

      setStep(2);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: typeof error === 'string' ? error : 'Something went wrong',
        color: 'red',
      });
    }
  };

  const handleLogin = async ({
    email,
    password,
    otp,
  }: AuthFormFields): Promise<boolean> => {
    try {
      if (step === 1 && mode === AuthFormMode.AuthWithOTP) {
        await handleSendOTP({ email });
        return false;
      }

      if (!email || (!password && !otp))
        throw new Error('Please fill in all fields');

      const { authenticate } = await import('../utils/auth-handler');

      const authData: {
        supabaseClient: SupabaseClient;
        method: AuthMethod;
        email: string;
        password?: string;
        otp?: string;
      } = {
        supabaseClient,
        method,
        email,
        password,
        otp,
      };

      if (mode === AuthFormMode.AuthWithOTP) delete authData.password;
      if (mode === AuthFormMode.AuthWithPassword) delete authData.otp;

      await authenticate(authData);

      mutate('/api/user');
      mutate('/api/workspaces/current');

      // If there is a redirectedFrom URL, redirect to it
      // Otherwise, redirect to the homepage
      const { redirectedFrom: nextUrl } = router.query;
      router.push(nextUrl ? nextUrl.toString() : '/onboarding');

      return true;
    } catch (error) {
      showNotification({
        title: 'Error',
        message: typeof error === 'string' ? error : 'Something went wrong',
        color: 'red',
      });

      return false;
    }
  };

  const { t } = useTranslation('login');

  const login = t('login');
  const loggingIn = t('logging-in');

  const loginWithOtp = t('login-with-otp');
  const loginWithPassword = t('login-with-password');

  const signup = t('signup');

  const welcomeBack = t('welcome-back');
  const welcomeBackDesc = t('welcome-back-desc');

  const noAccount = t('no-account');

  const switchMode = () =>
    setMode((prevMode) =>
      prevMode === AuthFormMode.AuthWithOTP
        ? AuthFormMode.AuthWithPassword
        : AuthFormMode.AuthWithOTP
    );

  const modeLabel =
    mode === AuthFormMode.AuthWithOTP ? loginWithPassword : loginWithOtp;

  return (
    <>
      <HeaderX label={`Tuturuuu — ${login}`} />
      <Image
        src="/media/background/auth-featured-bg.jpg"
        alt="Featured background"
        width={1619}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />

      <AuthForm
        title={welcomeBack}
        description={welcomeBackDesc}
        submitLabel={login}
        submittingLabel={loggingIn}
        secondaryAction={{
          description: noAccount,
          label: signup,
          href: '/signup',
        }}
        modeProps={{
          label: modeLabel,
          onSwitch: switchMode,
        }}
        mode={mode}
        step={step}
        steps={steps}
        onSubmit={handleLogin}
      />
    </>
  );
};

export default LoginPage;
