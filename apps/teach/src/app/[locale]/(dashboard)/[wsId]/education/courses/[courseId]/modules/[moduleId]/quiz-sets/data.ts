import type { WorkspaceQuizSet } from '@tuturuuu/types';
import {
  type CourseModulePageScope,
  requireCourseModulePageAccess,
} from '@/lib/course-module-page-access';

export async function getData(
  scope: CourseModulePageScope,
  {
    q,
    page = '1',
    pageSize = '10',
    retry = true,
  }: { q?: string; page?: string; pageSize?: string; retry?: boolean } = {}
): Promise<{ data: WorkspaceQuizSet[]; count: number }> {
  const { supabase } = await requireCourseModulePageAccess(scope);
  const { moduleId } = scope;

  const queryBuilder = supabase
    .from('course_module_quiz_sets')
    .select('...workspace_quiz_sets(*)', {
      count: 'exact',
    })
    .eq('module_id', moduleId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;
  if (error) {
    if (!retry) throw error;
    return getData(scope, { q, pageSize, retry: false });
  }

  return { data: data || [], count: count || 0 };
}
