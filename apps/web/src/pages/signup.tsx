import React, { useState } from 'react';
import HeaderX from '../components/metadata/HeaderX';
import { showNotification } from '@mantine/notifications';
import { AuthFormFields } from '../utils/auth-handler';
import AuthForm, { AuthFormMode } from '../components/auth/AuthForm';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Image from 'next/image';
import useTranslation from 'next-translate/useTranslation';
import AuthEmailSent from '../components/auth/AuthEmailSent';

const SignupPage = () => {
  const supabase = createClientComponentClient();
  const method = 'signup';

  const [email, setEmail] = useState<string | null>(null);

  const handleSignup = async ({
    email,
    password,
  }: AuthFormFields): Promise<boolean> => {
    try {
      if (!password || !email) throw new Error('Please fill in all fields');

      const { authenticate } = await import('../utils/auth-handler');

      await authenticate({
        supabase,
        method,
        email,
        password,
      });

      setEmail(email);
      return true;
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

      return false;
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
          mode={AuthFormMode.AuthWithPassword}
          onSubmit={handleSignup}
        />
      )}
    </>
  );
};

export default SignupPage;
