import {
  getAppSessionClaimsFromRequest,
  hasWebAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  getTulearnBootstrap,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { NoWorkspaceState } from '@/components/learner-shell';
import { redirect } from '@/i18n/navigation';

export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const requestHeaders = await headers();
  const appSession = getAppSessionClaimsFromRequest(
    { headers: requestHeaders },
    { targetApp: 'learn' }
  );
  const hasWebAppSession = hasWebAppSessionTokenFromRequest({
    headers: requestHeaders,
  });

  if (!appSession || !hasWebAppSession) {
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
    return <NoWorkspaceState />;
  }

  redirect({ href: `/${workspaceId}`, locale });
}
