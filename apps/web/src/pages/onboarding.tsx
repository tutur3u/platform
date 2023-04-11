import { useEffect } from 'react';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import OnboardingForm from '../components/onboarding/OnboardingForm';
import { mutate } from 'swr';
import Image from 'next/image';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };

  const { error } = await supabase
    .from('users')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (error) {
    await supabase.auth.signOut();

    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

  return {
    props: {
      initialSession: session,
      user: session.user,
    },
  };
};

const OnboardingPage = () => {
  useEffect(() => {
    mutate('/api/workspaces/current');
  }, []);

  return (
    <>
      <Image
        src="/media/background/auth-featured-bg.jpg"
        alt="Featured background"
        width={1619}
        height={1080}
        className="fixed inset-0 h-screen w-screen object-cover"
      />
      <OnboardingForm />
    </>
  );
};

export default OnboardingPage;
