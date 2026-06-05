import { GraduationCap } from '@tuturuuu/icons';
import {
  getTulearnBootstrap,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitations,
  SatelliteWorkspaceInvitationList,
} from '@tuturuuu/satellite/workspace-invitation';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

async function NoTeachWorkspaceState() {
  const t = await getTranslations('teachDashboard');

  return (
    <div className="flex min-h-screen items-center justify-center bg-root-background p-6">
      <div className="max-w-lg border-2 border-border bg-background p-8 text-center shadow-[9px_9px_0_var(--border)]">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center border-2 border-border bg-dynamic-yellow/15 shadow-[4px_4px_0_var(--border)]">
          <GraduationCap className="h-8 w-8" />
        </div>
        <h1 className="font-black text-3xl tracking-normal">
          {t('emptyGroupsTitle')}
        </h1>
        <p className="mt-3 text-muted-foreground leading-7">
          {t('emptyGroupsBody')}
        </p>
      </div>
    </div>
  );
}

export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('teach');

  if (!appSession) {
    redirect({ href: '/login?next=/dashboard', locale });
  }

  let bootstrap: Awaited<ReturnType<typeof getTulearnBootstrap>>;
  try {
    bootstrap = await getTulearnBootstrap(
      withForwardedInternalApiAuth(requestHeaders)
    );
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect({ href: '/login?next=/dashboard&refresh=1', locale });
    }

    throw error;
  }

  const workspaceId = bootstrap?.workspaces[0]?.id;
  if (!workspaceId) {
    const invitations = await getPendingWorkspaceInvitations(requestHeaders);

    if (invitations.length > 0) {
      return (
        <SatelliteWorkspaceInvitationList
          afterDeclineHref="/dashboard"
          invitations={invitations}
        />
      );
    }

    return <NoTeachWorkspaceState />;
  }

  redirect({ href: `/${workspaceId}`, locale });
}
