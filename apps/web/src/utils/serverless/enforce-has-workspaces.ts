import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';

export const enforceHasWorkspaces = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const { wsId } = ctx.query;

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

  const userPromise = supabase
    .from('users')
    .select('id')
    .eq('id', session.user.id)
    .single();

  const wsPromise = supabase
    .from('workspaces')
    .select('id')
    .eq('id', wsId)
    .single();

  const [user, ws] = await Promise.all([userPromise, wsPromise]);

  if (user?.error)
    return {
      redirect: {
        destination: '/onboarding',
        permanent: false,
      },
    };

  if (ws?.error) {
    return {
      notFound: true,
    };
  }

  return {
    props: {},
  };
};
