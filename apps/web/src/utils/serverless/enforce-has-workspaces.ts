import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { GetServerSidePropsContext } from 'next';

export const enforceHasWorkspaces = async (ctx: GetServerSidePropsContext) => {
  const supabase = createPagesServerClient(ctx);

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

  const { data, error } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', wsId)
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
