import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type QuizWithAnswerFallback = {
  answer?: Json | null;
  id: string;
};

function isMissingPrivateQuizAnswerRelation(error: SupabaseErrorLike) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST106' ||
    error.code === 'PGRST205' ||
    /workspace_quiz_answers/iu.test(error.message ?? '')
  );
}

function privateQuizAnswers(db: TypedSupabaseClient) {
  return db.schema('private').from('workspace_quiz_answers');
}

export async function attachPrivateWorkspaceQuizAnswers<
  T extends QuizWithAnswerFallback,
>(db: TypedSupabaseClient, quizzes: T[]) {
  if (quizzes.length === 0) return quizzes;

  const quizIds = quizzes.map((quiz) => quiz.id);
  const { data, error } = await privateQuizAnswers(db)
    .select('quiz_id, answer')
    .in('quiz_id', quizIds);

  if (error) {
    if (isMissingPrivateQuizAnswerRelation(error)) {
      return quizzes.map((quiz) => ({
        ...quiz,
        answer: quiz.answer ?? null,
      }));
    }

    throw error;
  }

  const answerByQuizId = new Map(
    (data ?? []).map((row) => [row.quiz_id, row.answer] as const)
  );

  return quizzes.map((quiz) => ({
    ...quiz,
    answer: answerByQuizId.get(quiz.id) ?? quiz.answer ?? null,
  }));
}

export async function setPrivateWorkspaceQuizAnswer({
  answer,
  db,
  quizId,
}: {
  answer: Json | null | undefined;
  db: TypedSupabaseClient;
  quizId: string;
}) {
  if (answer === undefined) return;

  const response =
    answer === null
      ? await privateQuizAnswers(db).delete().eq('quiz_id', quizId)
      : await privateQuizAnswers(db).upsert(
          {
            answer,
            quiz_id: quizId,
          },
          { onConflict: 'quiz_id' }
        );

  if (!response.error) return;

  if (!isMissingPrivateQuizAnswerRelation(response.error)) {
    throw response.error;
  }

  const { error: fallbackError } = await db
    .from('workspace_quizzes')
    .update({ answer: answer ?? null })
    .eq('id', quizId);

  if (fallbackError) throw fallbackError;
}
