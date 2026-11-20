import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionId } from '@tuturuuu/types/db';
import { notFound } from 'next/navigation';
import { requireEducationPageAccess } from '@/lib/education-page-access';

export interface CourseModulePageScope {
  wsId: string;
  courseId: string;
  moduleId: string;
}

export async function requireCourseModulePageAccess(
  { wsId, courseId, moduleId }: CourseModulePageScope,
  anyOf?: readonly PermissionId[]
) {
  const { resolvedWsId } = await requireEducationPageAccess(wsId, anyOf);
  const supabase = await createAdminClient();
  const { data: module, error } = await supabase
    .from('workspace_course_modules')
    .select('*, workspace_user_groups!inner(ws_id)')
    .eq('id', moduleId)
    .eq('group_id', courseId)
    .eq('workspace_user_groups.ws_id', resolvedWsId)
    .maybeSingle();

  if (error) throw error;
  if (!module) notFound();

  return { supabase, module, resolvedWsId };
}
