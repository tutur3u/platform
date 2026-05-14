import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { TeachHome } from '@/components/teach-home';

export default async function TeachPage() {
  const appSession = getAppSessionClaimsFromRequest(
    { headers: await headers() },
    { targetApp: 'teach' }
  );

  return (
    <TeachHome
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
    />
  );
}
