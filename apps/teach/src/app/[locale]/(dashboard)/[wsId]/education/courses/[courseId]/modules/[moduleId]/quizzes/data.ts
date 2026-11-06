import { attachPrivateWorkspaceQuizAnswers } from '@tuturuuu/education-core/education/private-quiz-answers';
import {
  type CourseModulePageScope,
  requireCourseModulePageAccess,
} from '@/lib/course-module-page-access';

export async function getQuizzes(scope: CourseModulePageScope) {
  const { supabase } = await requireCourseModulePageAccess(scope);
  const { moduleId } = scope;

  const { data, error } = await supabase
    .from('course_module_quizzes')
    .select('...workspace_quizzes(*, quiz_options(*))')
    .eq('module_id', moduleId);

  if (error) {
    console.error('error', error);
  }

  return attachPrivateWorkspaceQuizAnswers(supabase, data || []);
}
