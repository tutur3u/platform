import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

const SUBMISSION_PAGE_SIZE = 500;

interface CompletionModule {
  id: string;
  is_quiz_score_published: boolean | null;
  course_module_quizzes: { quiz_id: string }[];
}

export async function getLearnerCompletedModuleIds(
  db: TypedSupabaseClient,
  modules: CompletionModule[],
  userId: string
) {
  const completed = new Set<string>();
  const releasedQuizzes = new Map<string, Set<string>>();
  for (const module of modules) {
    if (module.course_module_quizzes.length === 0) {
      completed.add(module.id);
    } else if (module.is_quiz_score_published === true) {
      releasedQuizzes.set(
        module.id,
        new Set(module.course_module_quizzes.map(({ quiz_id }) => quiz_id))
      );
    }
  }
  if (releasedQuizzes.size === 0) return completed;

  const moduleIds = [...releasedQuizzes.keys()];
  const correctCounts = new Map<string, number>();
  for (let offset = 0; ; offset += SUBMISSION_PAGE_SIZE) {
    const { data, error } = await db
      .from('course_module_quiz_submissions')
      .select('module_id, quiz_id')
      .eq('user_id', userId)
      .eq('is_correct', true)
      .in('module_id', moduleIds)
      .order('module_id')
      .order('quiz_id')
      .range(offset, offset + SUBMISSION_PAGE_SIZE - 1);
    if (error) throw error;

    const submissions = data ?? [];
    for (const submission of submissions) {
      const quizzes = releasedQuizzes.get(submission.module_id);
      if (!quizzes?.has(submission.quiz_id)) continue;
      const correctCount = (correctCounts.get(submission.module_id) ?? 0) + 1;
      correctCounts.set(submission.module_id, correctCount);
      if (correctCount / quizzes.size >= 0.5)
        completed.add(submission.module_id);
    }
    if (submissions.length < SUBMISSION_PAGE_SIZE) break;
  }
  return completed;
}
