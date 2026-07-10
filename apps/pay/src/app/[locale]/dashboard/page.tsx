import { CreditCard } from '@tuturuuu/icons';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitations,
  SatelliteWorkspaceInvitationList,
} from '@tuturuuu/satellite/workspace-invitation';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';

export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('pay');

  if (!appSession) {
    redirect({ href: '/login?next=/dashboard', locale });
  }

  const invitations = await getPendingWorkspaceInvitations(requestHeaders);

  if (invitations.length > 0) {
    return (
      <SatelliteWorkspaceInvitationList
        afterDeclineHref="/dashboard"
        invitations={invitations}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-root-background p-6">
      <div className="max-w-lg border-2 border-border bg-background p-8 text-center shadow-[9px_9px_0_var(--border)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border-2 border-border bg-dynamic-green/15 shadow-[4px_4px_0_var(--border)]">
          <CreditCard className="h-8 w-8" />
        </div>
        <h1 className="font-black text-3xl tracking-normal">Pay</h1>
        <p className="mt-3 text-muted-foreground leading-7">
          Manage workspace billing, subscriptions, seats, and payment methods.
        </p>
      </div>
    </div>
  );
}
