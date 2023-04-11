import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';
import { ROOT_WORKSPACE_ID } from '../../constants/common';

export const enforceRootWorkspace = async (ctx: GetServerSidePropsContext) => {
  const supabase = createServerSupabaseClient(ctx);

  const { wsId } = ctx.query;

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;

  if (!isRootWorkspace) {
    return {
      notFound: true,
    };
  }

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

  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', ROOT_WORKSPACE_ID)
    .single();

  if (!data || error) {
    return {
      notFound: true,
    };
  }

  return {
    props: {},
  };
};
