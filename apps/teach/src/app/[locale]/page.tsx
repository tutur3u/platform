import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { TeachHome } from '@/components/teach-home';

export default async function TeachPage() {
  const appSession = await getSatelliteAppSession('teach');

  return (
    <TeachHome
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
    />
  );
}
