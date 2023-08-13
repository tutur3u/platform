import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import React from 'react';
import HeaderX from '../components/metadata/HeaderX';
import { showNotification } from '@mantine/notifications';
import { AuthFormFields } from '../utils/auth-handler';
import AuthForm, { AuthFormMode } from '../components/auth/AuthForm';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Image from 'next/image';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/router';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createPagesServerClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/recover',
        permanent: false,
      },
      props: {
        initialSession: session,
      },
    };

  return {
    props: {},
  };
};

const ResetPasswordPage = () => {
  const supabase = createClientComponentClient();
  const router = useRouter();

  const handleResetPassword = async ({
    password,
  }: AuthFormFields): Promise<boolean> => {
    try {
      if (!password) throw new Error('Please fill in all fields');

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) throw new Error(error.message);

      showNotification({
        title: 'Success',
        message: 'Password reset successfully',
        color: 'green',
      });

      router.push('/onboarding');
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
          message: 'Something went wrong',
          color: 'red',
        });
      return false;
    }
  };

  const { t } = useTranslation('reset-password');

  const resetPassword = t('reset-password');
  const resetPasswordDesc = t('reset-password-desc');

  const resetting = t('resetting');

  return (
    <>
      <HeaderX label={`Tuturuuu — ${resetPassword}`} />
      <Image
        src="/media/background/auth-featured-bg.jpg"
        alt="Featured background"
        width={1619}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />
      <AuthForm
        title={resetPassword}
        description={resetPasswordDesc}
        submitLabel={resetPassword}
        submittingLabel={resetting}
        mode={AuthFormMode.PasswordReset}
        onSubmit={handleResetPassword}
      />
    </>
  );
};

export default ResetPasswordPage;
