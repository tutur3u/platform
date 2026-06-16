import {
  getTulearnBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';
import { TestDetailClient } from './client';

export default async function TestDetailPage({
  params,
}: {
  params: Promise<{
    locale: string;
    moduleId: string;
    wsId: string;
    testId: string;
  }>;
}) {
  const { locale, moduleId, wsId, testId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);

  const bootstrap = await getTulearnBootstrap(authOptions).catch(() => null);

  if (!bootstrap) {
    return redirect({
      href: `/login?next=/${wsId}/modules/${moduleId}/tests/${testId}`,
      locale,
    });
  }

  const workspace = bootstrap.workspaces.find((w) => w.id === wsId);

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    return redirect({
      href: fallbackId ? `/${fallbackId}/modules` : '/dashboard',
      locale,
    });
  }

  return (
    <TestDetailClient
      courseId={moduleId}
      wsId={wsId}
      testId={testId}
      workspaceName={workspace.name}
    />
  );
}
