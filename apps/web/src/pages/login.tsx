import React, { useState } from 'react';
import HeaderX from '../components/metadata/HeaderX';
import { showNotification } from '@mantine/notifications';
import { AuthFormFields } from '../utils/auth-handler';
import AuthForm, { AuthFormMode } from '../components/auth/AuthForm';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/router';
import Image from 'next/image';
import useTranslation from 'next-translate/useTranslation';
import { mutate } from 'swr';

const LoginPage = () => {
  const supabase = createClientComponentClient();
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

      await authenticate({
        supabase,
        method,
        email,
        password,
        otp,
      });

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
