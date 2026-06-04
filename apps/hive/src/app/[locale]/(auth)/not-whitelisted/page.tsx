import { HiveAccessRequestCard } from '@tuturuuu/hive-ui/access';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { redirect } from 'next/navigation';

export default async function NotWhitelistedPage() {
  const appSession = await getSatelliteAppSession('hive');

  if (!appSession) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-dynamic-background p-6 text-dynamic-foreground">
      <HiveAccessRequestCard email={appSession.email ?? null} />
    </main>
  );
}
