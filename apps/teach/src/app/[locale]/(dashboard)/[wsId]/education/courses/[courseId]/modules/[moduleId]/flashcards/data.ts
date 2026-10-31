import {
  type CourseModulePageScope,
  requireCourseModulePageAccess,
} from '@/lib/course-module-page-access';

export async function getFlashcards(scope: CourseModulePageScope) {
  const { supabase } = await requireCourseModulePageAccess(scope);
  const { moduleId } = scope;

  const { data, error } = await supabase
    .from('course_module_flashcards')
    .select('...workspace_flashcards(*)')
    .eq('module_id', moduleId);

  if (error) {
    console.error('error', error);
  }

  return data || [];
}
