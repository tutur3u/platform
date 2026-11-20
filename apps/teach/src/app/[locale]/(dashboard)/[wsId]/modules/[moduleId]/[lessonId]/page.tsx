import { headers } from 'next/headers';
import { redirect } from '@/i18n/navigation';
import { getTeachRequestBootstrap } from '@/lib/teach-bootstrap';
import { LessonDetailClient } from './client';

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{
    lessonId: string;
    locale: string;
    moduleId: string;
    wsId: string;
  }>;
}) {
  const { lessonId, locale, moduleId, wsId } = await params;
  const requestHeaders = await headers();

  const bootstrap = await getTeachRequestBootstrap(requestHeaders).catch(
    () => null
  );

  if (!bootstrap) {
    redirect({
      href: `/login?next=/${wsId}/modules/${moduleId}/${lessonId}`,
      locale,
    });
    throw new Error('Redirecting to Teach login');
  }

  const workspace = bootstrap.workspaces.find((w) => w.id === wsId);

  if (!workspace) {
    const fallbackId = bootstrap.workspaces[0]?.id;
    redirect({
      href: fallbackId ? `/${fallbackId}/modules` : '/dashboard',
      locale,
    });
    throw new Error('Workspace not found');
  }

  return (
    <LessonDetailClient
      courseId={moduleId}
      lessonId={lessonId}
      wsId={wsId}
      workspaceName={workspace.name}
    />
  );
}
