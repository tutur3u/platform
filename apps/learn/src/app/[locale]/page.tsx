import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { LearnLanding } from '@/components/learn-landing';

export default async function IndexPage() {
  const appSession = await getSatelliteAppSession('learn');

  return (
    <LearnLanding
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
    />
  );
}
