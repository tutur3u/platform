import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import React from 'react';
import HeaderX from '../components/metadata/HeaderX';
import { showNotification } from '@mantine/notifications';
import { AuthFormFields } from '../utils/auth-handler';
import AuthForm from '../components/auth/AuthForm';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Image from 'next/image';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/router';

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

const ResetPasswordPage = () => {
  const supabaseClient = useSupabaseClient();

  const router = useRouter();

  const handleResetPassword = async ({ password }: AuthFormFields) => {
    try {
      if (!password) throw new Error('Please fill in all fields');

      const { error } = await supabaseClient.auth.updateUser({
        password,
      });

      console.log('password', password);

      if (error) throw new Error(error.message);
      showNotification({
        title: 'Success',
        message: 'Password reset successfully',
        color: 'green',
      });
    } catch (e) {
      if (e instanceof Error)
        showNotification({
          title: 'Error',
          message: e?.message || 'Something went wrong',
          color: 'red',
        });
      else alert(e);
    }
    router.push('https://tuturuuu.com/onboarding');
  };

  const { t } = useTranslation('recover');

  const recoverPassword = t('recover-password');
  const recoverPasswordDesc = t('recover-password-desc');

  const send = t('send');
  const sending = t('sending');

  const alreadyHaveAccount = t('already-have-account');
  const login = t('login');

  return (
    <>
      <HeaderX label={`Tuturuuu — ${recoverPassword}`} />
      <Image
        src="/media/background/auth-featured-bg.jpg"
        alt="Featured background"
        width={1619}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />
      <AuthForm
        title={recoverPassword}
        description={recoverPasswordDesc}
        submitLabel={send}
        submittingLabel={sending}
        secondaryAction={{
          description: alreadyHaveAccount,
          label: login,
          href: '/login',
        }}
        onSubmit={handleResetPassword}
        resetPasswordMode
      />
    </>
  );
};

export default ResetPasswordPage;
