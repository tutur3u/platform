import {
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';

export default async function IndexPage({
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
    redirect({ href: '/login', locale });
  }

  redirect({ href: `/${workspaceId}`, locale });
}
