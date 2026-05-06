import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { TeachHome } from '@/components/teach-home';

export default async function TeachPage() {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase).catch(
    () => ({ user: null })
  );

  return (
    <TeachHome dashboardHref={user ? '/dashboard' : '/login?next=/dashboard'} />
  );
}
