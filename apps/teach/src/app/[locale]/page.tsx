import {
  getAppSessionClaimsFromRequest,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { TeachHome } from '@/components/teach-home';

export default async function TeachPage() {
  const requestHeaders = await headers();
  const appSession = getAppSessionClaimsFromRequest(
    { headers: requestHeaders },
    { targetApp: 'teach' }
  );
  const hasWebAppSession = hasWebAppSessionTokenFromRequest({
    headers: requestHeaders,
  });
  const hasCoordinatedSession = Boolean(appSession && hasWebAppSession);

  return (
    <TeachHome
      dashboardHref={
        hasCoordinatedSession ? '/dashboard' : '/login?next=/dashboard'
      }
    />
  );
}
