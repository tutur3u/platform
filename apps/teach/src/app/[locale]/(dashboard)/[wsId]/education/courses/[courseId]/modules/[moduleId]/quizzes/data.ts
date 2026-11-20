import { attachPrivateWorkspaceQuizAnswers } from '@tuturuuu/education-core/education/private-quiz-answers';
import {
  type CourseModulePageScope,
  requireCourseModulePageAccess,
} from '@/lib/course-module-page-access';

export async function getQuizzes(scope: CourseModulePageScope) {
  const { supabase, resolvedWsId } = await requireCourseModulePageAccess(
    scope,
    ['view_user_groups', 'update_user_groups']
  );

  const { data, error } = await supabase
    .from('course_module_quizzes')
    .select('...workspace_quizzes!inner(*, quiz_options(*))')
    .eq('module_id', scope.moduleId)
    .eq('workspace_quizzes.ws_id', resolvedWsId);

  if (error) {
    console.error('error', error);
  }

  return attachPrivateWorkspaceQuizAnswers(supabase, data || []);
}
