import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { CourseHeader } from '@tuturuuu/ui/custom/education/courses/course-header';
import { Separator } from '@tuturuuu/ui/separator';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { resolveRouteWorkspace } from '@/lib/resolve-route-workspace';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
  }>;
}

export default async function CourseDetailsLayout({ children, params }: Props) {
  const { wsId: routeWsId, courseId } = await params;
  const { resolvedWsId } = await resolveRouteWorkspace(routeWsId);
  const data = await getData(resolvedWsId, courseId);

  return (
    <>
      <CourseHeader
        data={data}
        href={`/${routeWsId}/education/courses/${courseId}`}
      />
      <Separator className="my-4" />
      {children}
    </>
  );
}

async function getData(wsId: string, courseId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('workspace_courses')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', courseId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as unknown as UserGroup;
}
