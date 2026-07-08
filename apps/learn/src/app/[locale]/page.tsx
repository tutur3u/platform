import {
  getSatelliteAppSession,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
import { LearnLanding } from '@/components/learn-landing';

function firstNonBlank(values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

export default async function IndexPage() {
  const appSession = await getSatelliteAppSession('learn');
  const currentUser = appSession
    ? await getSatelliteCurrentUser('learn')
    : null;
  const userName = firstNonBlank([
    currentUser?.display_name,
    currentUser?.full_name,
    currentUser?.email,
  ]);

  return (
    <LearnLanding
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
      isAuthenticated={Boolean(appSession)}
      userName={userName}
    />
  );
}
