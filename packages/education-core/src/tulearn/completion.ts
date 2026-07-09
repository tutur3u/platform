import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export async function updateModuleCompletionStatus(
  sbAdmin: TypedSupabaseClient,
  moduleId: string,
  studentPlatformUserId: string
) {
  // 1. Fetch total quizzes in this module
  const { data: quizzes, error: quizzesErr } = await sbAdmin
    .from('course_module_quizzes')
    .select('quiz_id')
    .eq('module_id', moduleId);

  if (quizzesErr) {
    console.error(
      'Failed to fetch module quizzes for completion calculation:',
      quizzesErr
    );
    return;
  }

  // 2. Fetch correct submissions for this student in this module
  const { data: submissions, error: subErr } = await sbAdmin
    .from('course_module_quiz_submissions')
    .select('quiz_id, is_correct')
    .eq('module_id', moduleId)
    .eq('user_id', studentPlatformUserId);

  if (subErr) {
    console.error(
      'Failed to fetch submissions for completion calculation:',
      subErr
    );
    return;
  }

  const correctCount = (submissions ?? []).filter(
    (s: any) => s.is_correct === true
  ).length;
  const totalCount = quizzes?.length ?? 0;

  // A 50% pass rate is required to consider the module completed.
  const isCompleted = totalCount > 0 ? correctCount / totalCount >= 0.5 : true;

  const { error: upsertErr } = await sbAdmin
    .from('course_module_completion_status')
    .upsert(
      {
        module_id: moduleId,
        user_id: studentPlatformUserId,
        completion_status: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,module_id' }
    );

  if (upsertErr) {
    console.error(
      'Failed to upsert course_module_completion_status:',
      upsertErr
    );
  }
}
