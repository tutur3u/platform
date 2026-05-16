import {
  getAppSessionClaimsFromRequest,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { LearnLanding } from '@/components/learn-landing';

export default async function IndexPage() {
  const requestHeaders = await headers();
  const appSession = getAppSessionClaimsFromRequest(
    { headers: requestHeaders },
    { targetApp: 'learn' }
  );
  const hasWebAppSession = hasWebAppSessionTokenFromRequest({
    headers: requestHeaders,
  });
  const hasCoordinatedSession = Boolean(appSession && hasWebAppSession);

  return (
    <LearnLanding
      dashboardHref={
        hasCoordinatedSession ? '/dashboard' : '/login?next=/dashboard'
      }
    />
  );
}
