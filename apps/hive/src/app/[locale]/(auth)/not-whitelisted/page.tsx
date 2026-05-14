import { getAppSessionClaimsFromRequest } from '@tuturuuu/auth/app-session';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AccessRequestCard } from './access-request-card';

export default async function NotWhitelistedPage() {
  const appSession = getAppSessionClaimsFromRequest(
    { headers: await headers() },
    { targetApp: 'hive' }
  );

  if (!appSession) {
    redirect('/login');
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-dynamic-background p-6 text-dynamic-foreground">
      <AccessRequestCard email={appSession.email ?? null} />
    </main>
  );
}
