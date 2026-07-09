import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';
import { CourseBuilderClient } from './course-builder-client';

export const metadata: Metadata = {
  title: 'Course Builder',
  description:
    'Build and publish course modules with guided teacher workflows.',
};

interface Props {
  params: Promise<{
    courseId: string;
    wsId: string;
  }>;
}

export default async function CourseBuilderPage({ params }: Props) {
  const { wsId: routeWsId, courseId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const sbAdmin = await createAdminClient();

  const { data: course, error: courseError } = await sbAdmin
    .from('workspace_user_groups')
    .select('*')
    .eq('ws_id', resolvedWsId)
    .eq('id', courseId)
    .maybeSingle();

  if (courseError) throw courseError;
  if (!course) notFound();

  return (
    <CourseBuilderClient
      courseId={courseId}
      courseDescription={course.description}
      courseName={course.name}
      resolvedWsId={resolvedWsId}
      routeWsId={routeWsId}
    />
  );
}
