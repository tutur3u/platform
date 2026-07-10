import {
  getCurrentUserDefaultWorkspace,
  InternalApiError,
  listWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';

export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const requestHeaders = await headers();
  const appSession = await getSatelliteAppSession('contacts');

  if (!appSession) {
    redirect({ href: '/login?next=/dashboard', locale });
  }

  try {
    const auth = withForwardedInternalApiAuth(requestHeaders);

    // Prefer the user's default (or personal) workspace; otherwise fall back to
    // the first workspace they belong to — never the root/admin workspace.
    const defaultWorkspace = await getCurrentUserDefaultWorkspace(auth);
    const workspace =
      defaultWorkspace ?? (await listWorkspaces(auth))?.[0] ?? null;

    if (!workspace) {
      // The user has no accessible workspace yet; bounce through the central
      // login so it can surface onboarding / pending invitations.
      return redirect({ href: '/login?next=/dashboard&refresh=1', locale });
    }

    const workspaceSlug = toWorkspaceSlug(workspace.id, {
      personal: !!workspace.personal,
    });

    redirect({ href: `/${workspaceSlug}`, locale });
  } catch (error) {
    if (
      error instanceof InternalApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      redirect({ href: '/login?next=/dashboard&refresh=1', locale });
    }

    throw error;
  }
}
