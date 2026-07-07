import {
  getSatelliteAppSession,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
import { LearnLanding } from '@/components/learn-landing';

export default async function IndexPage() {
  const appSession = await getSatelliteAppSession('learn');
  const currentUser = appSession
    ? await getSatelliteCurrentUser('learn')
    : null;
  const userName =
    currentUser?.display_name ??
    currentUser?.full_name ??
    currentUser?.name ??
    currentUser?.email ??
    null;

  return (
    <LearnLanding
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
      isAuthenticated={Boolean(appSession)}
      userName={userName}
    />
  );
}
