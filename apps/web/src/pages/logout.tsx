import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { useSessionContext } from '@supabase/auth-helpers-react';
import { GetServerSidePropsContext } from 'next';
import { useRouter } from 'next/router';

export const getServerSideProps = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return {
      redirect: {
        destination: '/',
        permanent: false,
      },
    };

  return {
    props: {},
  };
};

const LogOutPage = () => {
  const router = useRouter();
  const { supabaseClient } = useSessionContext();

  const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    router.push('/');
  };

  return (
    <div className="h-screen w-screen p-4 md:p-8">
      <button
        className="flex h-full w-full cursor-pointer items-center justify-center rounded-lg border border-red-300/20 bg-red-300/10 p-4 text-3xl font-semibold text-red-300 transition duration-300 hover:border-red-300/30 hover:bg-red-300/20 md:text-6xl"
        onClick={handleLogout}
      >
        Log out
      </button>
    </div>
  );
};

export default LogOutPage;
