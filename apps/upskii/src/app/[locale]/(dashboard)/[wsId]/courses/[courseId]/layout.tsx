import { createClient } from '@tuturuuu/supabase/next/server';
import { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { CourseHeader } from '@tuturuuu/ui/custom/education/courses/course-header';
import { Separator } from '@tuturuuu/ui/separator';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
  }>;
}

export default async function CourseDetailsLayout({ children, params }: Props) {
  const { wsId, courseId } = await params;
  const data = await getData(wsId, courseId);

  return (
    <>
      <CourseHeader data={data} href={`/${wsId}/courses/${courseId}`} />
      <Separator className="my-4" />
      {children}
    </>
  );
}

async function getData(wsId: string, courseId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_courses')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', courseId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as UserGroup;
}
