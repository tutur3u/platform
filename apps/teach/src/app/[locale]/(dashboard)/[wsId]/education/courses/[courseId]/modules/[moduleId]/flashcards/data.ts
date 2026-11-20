import {
  type CourseModulePageScope,
  requireCourseModulePageAccess,
} from '@/lib/course-module-page-access';

export async function getFlashcards(scope: CourseModulePageScope) {
  const { supabase, resolvedWsId } = await requireCourseModulePageAccess(scope);
  const { moduleId } = scope;

  const { data, error } = await supabase
    .from('course_module_flashcards')
    .select('...workspace_flashcards!inner(*)')
    .eq('module_id', moduleId)
    .eq('workspace_flashcards.ws_id', resolvedWsId);

  if (error) {
    console.error('error', error);
  }

  return data || [];
}
