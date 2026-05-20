import {
  getCurrentUserDefaultWorkspace,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { ROOT_WORKSPACE_ID, toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';
import { requireMindUser } from '@/lib/access';

export default async function IndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireMindUser();
  const requestHeaders = await headers();

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
