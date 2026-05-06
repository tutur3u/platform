import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { LearnLanding } from '@/components/learn-landing';

export default async function IndexPage() {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase).catch(
    () => ({ user: null })
  );

  return (
    <LearnLanding
      dashboardHref={user ? '/dashboard' : '/login?next=/dashboard'}
    />
  );
}
