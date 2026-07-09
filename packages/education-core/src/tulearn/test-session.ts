import 'server-only';

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  asRecord,
  displayText,
  getMatchingPairs,
  getStringItems,
  type MatchingPair,
} from './quiz-content';

type SupabaseAdmin = TypedSupabaseClient;

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function stringArraysMatch(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function matchingPairsMatch(left: MatchingPair[], right: MatchingPair[]) {
  if (left.length !== right.length) return false;

  const remaining = new Map<string, number>();
  for (const pair of right) {
    const key = `${pair.left}\u0000${pair.right}`;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  for (const pair of left) {
    const key = `${pair.left}\u0000${pair.right}`;
    const count = remaining.get(key) ?? 0;
    if (count === 0) return false;
    if (count === 1) remaining.delete(key);
    else remaining.set(key, count - 1);
  }

  return remaining.size === 0;
}

function numberProperty(value: unknown, key: string): number | null {
  const property = asRecord(value)?.[key];
  if (typeof property === 'number' && Number.isFinite(property))
    return property;
  if (typeof property === 'string' && property.trim()) {
    const parsed = Number(property);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanProperty(value: unknown, key: string): boolean | null {
  const property = asRecord(value)?.[key];
  return typeof property === 'boolean' ? property : null;
}

export function isAttemptExpired(
  attempt: { started_at: string },
  durationInMinutes: number | null | undefined,
  now = Date.now()
) {
  if (!durationInMinutes) return false;

  const startedTime = new Date(attempt.started_at).getTime();
  const durationMs = durationInMinutes * 60 * 1000;
  const graceMs = 60 * 1000;

  return startedTime + durationMs + graceMs < now;
}

async function loadCorrectAnswerMap({
  quizIds,
  sbAdmin,
}: {
  quizIds: string[];
  sbAdmin: SupabaseAdmin;
}) {
  const { data: privateAnswers, error } = await sbAdmin
    .schema('private')
    .from('workspace_quiz_answers')
    .select('quiz_id, answer')
    .in('quiz_id', quizIds);

  if (error) throw error;

  return new Map(
    (privateAnswers ?? []).map((privateAnswer) => [
      privateAnswer.quiz_id,
      privateAnswer.answer,
    ])
  );
}

export async function submitTestAttemptInternal(
  sbAdmin: SupabaseAdmin,
  attemptId: string,
  testId: string,
  userPlatformUserId: string
) {
  // 1. Fetch test details to check duration & make sure it is not already submitted
  const { data: attempt, error: attemptErr } = await sbAdmin
    .from('course_test_attempts')
    .select('*')
    .eq('id', attemptId)
    .eq('user_id', userPlatformUserId)
    .maybeSingle();

  if (attemptErr || !attempt) {
    throw new Error('Attempt not found');
  }

  if (attempt.submitted_at) {
    return attempt; // Already submitted
  }

  // 2. Fetch all quizzes linked to this test
  const { data: testQuizzes, error: tqErr } = await sbAdmin
    .from('course_test_quizzes')
    .select('quiz_id')
    .eq('test_id', testId);

  if (tqErr) throw tqErr;

  const quizIds = (testQuizzes ?? []).map((tq) => tq.quiz_id);
  if (quizIds.length === 0) {
    // Empty test, 0 score
    const { data: updated, error: updateErr } = await sbAdmin
      .from('course_test_attempts')
      .update({
        submitted_at: new Date().toISOString(),
        score: 0,
      })
      .eq('id', attemptId)
      .select('*')
      .single();

    if (updateErr) throw updateErr;
    return updated;
  }

  // Fetch full details of these quizzes
  const { data: quizzes, error: quizzesErr } = await sbAdmin
    .from('workspace_quizzes')
    .select(
      'id, question, type, content, answer, score, quiz_options(id, value, is_correct)'
    )
    .in('id', quizIds);

  if (quizzesErr) throw quizzesErr;

  // 3. Fetch student's saved answers for this attempt
  const { data: savedAnswers, error: answersErr } = await sbAdmin
    .from('course_test_attempt_answers')
    .select('*')
    .eq('attempt_id', attemptId);

  if (answersErr) throw answersErr;

  const answersMap = new Map(
    (savedAnswers ?? []).map((ans) => [ans.quiz_id, ans])
  );
  const correctAnswerMap = await loadCorrectAnswerMap({ quizIds, sbAdmin });

  let totalScore = 0;
  const gradedAnswers = [];

  // 4. Grade each quiz
  for (const quiz of quizzes ?? []) {
    const studentAns = answersMap.get(quiz.id);
    const quizScore = quiz.score ?? 1;

    let isCorrect = false;
    let scoreAwarded = 0;

    if (studentAns) {
      const selectedOptionId = studentAns.selected_option_id;
      const answer = studentAns.answer;

      if (!quiz.type || quiz.type === 'multiple_choice') {
        if (selectedOptionId) {
          const isOptionUuid = UUID_REGEX.test(selectedOptionId);
          if (isOptionUuid) {
            const option = (
              quiz.quiz_options as
                | { id: string; is_correct: boolean }[]
                | undefined
            )?.find((opt) => opt.id === selectedOptionId);
            isCorrect = option?.is_correct ?? false;
          } else {
            const correctAnswer =
              correctAnswerMap.get(quiz.id) ?? quiz.answer ?? null;
            const correctIndex = numberProperty(correctAnswer, 'correctIndex');
            const selectedIndex =
              asRecord(answer)?.selectedIndex ??
              (typeof answer === 'number' ? answer : null);
            isCorrect =
              correctIndex !== null &&
              selectedIndex !== null &&
              Number(correctIndex) === Number(selectedIndex);
          }
        }
      } else if (quiz.type === 'true_false') {
        const correctAnswer =
          correctAnswerMap.get(quiz.id) ?? quiz.answer ?? null;
        const clientCorrect =
          typeof answer === 'boolean' ? answer : asRecord(answer)?.correct;
        const correctKey =
          typeof correctAnswer === 'boolean'
            ? correctAnswer
            : booleanProperty(correctAnswer, 'correct');
        isCorrect = clientCorrect === correctKey;
      } else if (quiz.type === 'ordering') {
        const correctAnswer =
          correctAnswerMap.get(quiz.id) ?? quiz.answer ?? null;
        const correctOrder = getStringItems(correctAnswer, 'order');
        const submittedOrder = Array.isArray(answer)
          ? answer.map(displayText)
          : getStringItems(answer, 'order');
        const fallbackOrder =
          correctOrder.length > 0
            ? correctOrder
            : getStringItems(quiz.content, 'items');

        isCorrect =
          fallbackOrder.length > 0 &&
          stringArraysMatch(submittedOrder, fallbackOrder);
      } else if (quiz.type === 'matching') {
        const correctAnswer =
          correctAnswerMap.get(quiz.id) ?? quiz.answer ?? null;
        const correctPairs = getMatchingPairs(correctAnswer);
        const submittedPairs = getMatchingPairs(answer);
        const fallbackPairs =
          correctPairs.length > 0
            ? correctPairs
            : getMatchingPairs(quiz.content);

        isCorrect =
          fallbackPairs.length > 0 &&
          matchingPairsMatch(submittedPairs, fallbackPairs);
      } else if (quiz.type === 'paragraph') {
        // Paragraph questions are typically manual grading, default is false/0 until manual review
        isCorrect = false;
      }

      scoreAwarded = isCorrect ? quizScore : 0;
    }

    if (isCorrect) {
      totalScore += quizScore;
    }

    gradedAnswers.push({
      attempt_id: attemptId,
      quiz_id: quiz.id,
      selected_option_id: studentAns?.selected_option_id ?? null,
      answer: studentAns?.answer ?? null,
      is_correct: isCorrect,
      score_awarded: scoreAwarded,
    });
  }

  // 5. Update graded answers
  if (gradedAnswers.length > 0) {
    const { error: upsertErr } = await sbAdmin
      .from('course_test_attempt_answers')
      .upsert(gradedAnswers, { onConflict: 'attempt_id,quiz_id' });

    if (upsertErr) throw upsertErr;
  }

  // 6. Complete and score the attempt record
  const { data: finalAttempt, error: updateErr } = await sbAdmin
    .from('course_test_attempts')
    .update({
      submitted_at: new Date().toISOString(),
      score: totalScore,
    })
    .eq('id', attemptId)
    .select('*')
    .single();

  if (updateErr) throw updateErr;

  return finalAttempt;
}
