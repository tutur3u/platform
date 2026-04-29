import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import Menu from './menu';

export default async function ServerMenu() {
  const supabase = await createClient();

  const { user: sbUser } = await resolveAuthenticatedSessionUser(supabase);

  const user = await getCurrentUser();

  return <Menu sbUser={sbUser} user={user} />;
}
