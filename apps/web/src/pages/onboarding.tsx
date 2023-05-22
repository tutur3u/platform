import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import OnboardingForm from '../components/onboarding/OnboardingForm';
import Image from 'next/image';
import { useRouter } from 'next/router';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }

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
  const {
    query: { nextUrl, withWorkspace, fastRefresh },
  } = useRouter();

  const forceHideBackground =
    fastRefresh === 'true' || (nextUrl != null && withWorkspace === 'true');

  return (
    <>
      {forceHideBackground ? null : (
        <Image
          src="/media/background/auth-featured-bg.jpg"
          alt="Featured background"
          width={1619}
          height={1080}
          className="fixed inset-0 h-screen w-screen object-cover"
        />
      )}

      <OnboardingForm forceLoading={forceHideBackground} />
    </>
  );
};

export default OnboardingPage;
