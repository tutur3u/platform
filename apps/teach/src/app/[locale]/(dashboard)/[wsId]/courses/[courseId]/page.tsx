import {
  getTeachBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';
import { ModuleDetailClient } from '../../modules/[moduleId]/client';

export default async function CourseWorkspacePage({
  params,
}: {
  params: Promise<{ courseId: string; locale: string; wsId: string }>;
}) {
  const { courseId, locale, wsId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);
  const bootstrap = await getTeachBootstrap(authOptions).catch(() => null);

  if (!bootstrap) {
    return redirect({
      href: `/login?next=/${wsId}/courses/${courseId}`,
      locale,
    });
  }

  const workspace = bootstrap.workspaces.find((w) => w.id === wsId);

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    return redirect({
      href: fallbackId ? `/${fallbackId}/courses` : '/dashboard',
      locale,
    });
  }

  return (
    <ModuleDetailClient
      courseId={courseId}
      workspaceName={workspace.name}
      wsId={wsId}
    />
  );
}
