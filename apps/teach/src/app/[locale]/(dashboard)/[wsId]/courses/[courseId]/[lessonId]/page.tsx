import {
  getTeachBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';
import { LessonDetailClient } from '../../../modules/[moduleId]/[lessonId]/client';

export default async function CourseLessonPage({
  params,
}: {
  params: Promise<{
    courseId: string;
    lessonId: string;
    locale: string;
    wsId: string;
  }>;
}) {
  const { courseId, lessonId, locale, wsId } = await params;
  const requestHeaders = await headers();
  const authOptions = withForwardedInternalApiAuth(requestHeaders);
  const bootstrap = await getTeachBootstrap(authOptions).catch(() => null);

  if (!bootstrap) {
    return redirect({
      href: `/login?next=/${wsId}/courses/${courseId}/${lessonId}`,
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
    <LessonDetailClient
      courseId={courseId}
      lessonId={lessonId}
      workspaceName={workspace.name}
      wsId={wsId}
    />
  );
}
