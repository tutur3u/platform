import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { LearnLanding } from '@/components/learn-landing';

export default async function IndexPage() {
  const appSession = getAppSessionClaimsFromRequest(
    { headers: await headers() },
    { targetApp: 'learn' }
  );

  return (
    <LearnLanding
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
    />
  );
}
