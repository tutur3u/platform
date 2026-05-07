import {
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';

export default async function DashboardEntryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const requestHeaders = await headers();
  const bootstrap = await getTulearnBootstrap(
    withForwardedInternalApiAuth(requestHeaders)
  ).catch(() => null);

  const workspaceId = bootstrap?.workspaces[0]?.id;
  if (!workspaceId) {
    redirect({ href: '/login?next=/dashboard', locale });
  }

  redirect({ href: `/${workspaceId}`, locale });
}
