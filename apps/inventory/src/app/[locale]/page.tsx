import {
  getCurrentUserDefaultWorkspace,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { ROOT_WORKSPACE_ID, toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from '@/i18n/navigation';

// Resolve the user's default workspace directly at the root so visiting
// inventory.tuturuuu.com lands on the workspace in a single redirect, instead of
// bouncing through `/dashboard` first. The `/dashboard` route is kept as a
// fallback target referenced elsewhere (layout + invitation decline).
export default async function IndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  await connection();
  const { locale } = await params;
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('inventory');

  if (!appSession) {
    redirect({ href: '/login?next=/', locale });
  }

  try {
    const defaultWorkspace = await getCurrentUserDefaultWorkspace(
      withForwardedInternalApiAuth(requestHeaders)
    );

    const wsId = defaultWorkspace?.id ?? ROOT_WORKSPACE_ID;
    const workspaceSlug = toWorkspaceSlug(wsId, {
      personal: !!defaultWorkspace?.personal,
    });

    redirect({ href: `/${workspaceSlug}`, locale });
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect({ href: '/login?next=/&refresh=1', locale });
    }

    throw error;
  }
}
