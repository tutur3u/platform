import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  type CourseModulePageScope,
  requireCourseModulePageAccess,
} from '@/lib/course-module-page-access';

export async function getData(scope: CourseModulePageScope) {
  const { module } = await requireCourseModulePageAccess(scope);
  return module;
}

export async function getFlashcards({
  wsId,
  courseId,
  moduleId,
}: CourseModulePageScope) {
  const supabase = await createAdminClient();

  const { count, error } = await supabase
    .from('course_module_flashcards')
    .select(
      '*, workspace_course_modules!inner(group_id, workspace_user_groups!inner(ws_id))',
      { count: 'exact', head: true }
    )
    .eq('module_id', moduleId)
    .eq('workspace_course_modules.group_id', courseId)
    .eq('workspace_course_modules.workspace_user_groups.ws_id', wsId);
  if (error) throw error;

  return count;
}

export async function getQuizzes({
  wsId,
  courseId,
  moduleId,
}: CourseModulePageScope) {
  const supabase = await createAdminClient();

  const { count, error } = await supabase
    .from('course_module_quizzes')
    .select(
      '*, workspace_course_modules!inner(group_id, workspace_user_groups!inner(ws_id))',
      { count: 'exact', head: true }
    )
    .eq('module_id', moduleId)
    .eq('workspace_course_modules.group_id', courseId)
    .eq('workspace_course_modules.workspace_user_groups.ws_id', wsId);
  if (error) throw error;

  return count;
}

export async function getQuizSets({
  wsId,
  courseId,
  moduleId,
}: CourseModulePageScope) {
  const supabase = await createAdminClient();

  const { count, error } = await supabase
    .from('course_module_quiz_sets')
    .select(
      '*, workspace_course_modules!inner(group_id, workspace_user_groups!inner(ws_id))',
      { count: 'exact', head: true }
    )
    .eq('module_id', moduleId)
    .eq('workspace_course_modules.group_id', courseId)
    .eq('workspace_course_modules.workspace_user_groups.ws_id', wsId);
  if (error) throw error;

  return count;
}

export async function getResources({ path }: { path: string }) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase.storage.from('workspaces').list(path);
  if (error) throw error;

  return data;
}
