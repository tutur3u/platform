import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  asRecord,
  displayText,
  getMatchingPairs,
  getStringItems,
  type MatchingPair,
} from '@/lib/tulearn/quiz-content';
import {
  getLearnerModuleDetail,
  resolveTulearnSubject,
  tulearnAccessErrorResponse,
} from '@/lib/tulearn/service';

type Params = {
  courseId: string;
  moduleId: string;
  wsId: string;
};

type SupabaseAdmin = TypedSupabaseClient;

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const QuizSubmissionPayloadSchema = z.object({
  quizId: z.string().uuid(),
  selectedOptionId: z.string().nullable().optional(),
  answer: z.unknown().optional(),
});

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

async function loadCorrectOptionId({
  quizId,
  sbAdmin,
}: {
  quizId: string;
  sbAdmin: SupabaseAdmin;
}) {
  const { data, error } = await sbAdmin
    .from('quiz_options')
    .select('id')
    .eq('quiz_id', quizId)
    .eq('is_correct', true)
    .limit(1);

  if (error) throw error;
  return data?.[0]?.id ?? null;
}

async function multipleChoiceFeedback({
  correctAnswer,
  quizId,
  sbAdmin,
}: {
  correctAnswer: unknown;
  quizId: string;
  sbAdmin: SupabaseAdmin;
}): Promise<Json | null> {
  const correctIndex = numberProperty(correctAnswer, 'correctIndex');
  if (correctIndex !== null) return { correctIndex };

  const correctOptionId = await loadCorrectOptionId({ quizId, sbAdmin });
  return correctOptionId ? { correctOptionId } : null;
}

async function loadCorrectAnswer({
  fallbackAnswer,
  quizId,
  sbAdmin,
}: {
  fallbackAnswer: unknown;
  quizId: string;
  sbAdmin: SupabaseAdmin;
}) {
  const { data: privateAnswer, error } = await sbAdmin
    .schema('private')
    .from('workspace_quiz_answers')
    .select('answer')
    .eq('quiz_id', quizId)
    .maybeSingle();

  if (error) throw error;
  return privateAnswer?.answer ?? fallbackAnswer ?? null;
}

function firstJoined<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function submissionAnswer(value: unknown): Json | null {
  return value === undefined ? null : (value as Json);
}

export const GET = withSessionAuth<Params>(
  async (request, { supabase, user }, { courseId, moduleId, wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      const module = await getLearnerModuleDetail({
        courseId,
        db: await createAdminClient(),
        moduleId,
        studentPlatformUserId: subject.studentPlatformUserId,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      if (!module) {
        return NextResponse.json(
          { message: 'Module not found' },
          { status: 404 }
        );
      }

      // Fetch student submissions for this module's quizzes
      const sbAdmin = await createAdminClient();
      const { data: submissions, error: subError } = await sbAdmin
        .from('course_module_quiz_submissions')
        .select('quiz_id, selected_option_id, answer, is_correct, created_at')
        .eq('module_id', moduleId)
        .eq('user_id', subject.studentPlatformUserId)
        .order('created_at', { ascending: true });

      if (subError) throw subError;

      return NextResponse.json({
        ...module,
        submissions: submissions || [],
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to load Tulearn module:', error);
      return NextResponse.json(
        { message: 'Failed to load module' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

export const POST = withSessionAuth<Params>(
  async (request, { supabase, user }, { courseId, moduleId, wsId }) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      if (subject.readOnly) {
        return NextResponse.json(
          { message: 'Guest/Parent accounts are read-only' },
          { status: 403 }
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { message: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parsedBody = QuizSubmissionPayloadSchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const { quizId, selectedOptionId, answer } = parsedBody.data;
      const sbAdmin = await createAdminClient();

      const module = await getLearnerModuleDetail({
        courseId,
        db: sbAdmin,
        moduleId,
        studentPlatformUserId: subject.studentPlatformUserId,
        studentWorkspaceUserId: subject.studentWorkspaceUserId,
        wsId: subject.wsId,
      });

      if (!module) {
        return NextResponse.json(
          { message: 'Module not found' },
          { status: 404 }
        );
      }

      const { data: moduleQuiz, error: quizErr } = await sbAdmin
        .from('course_module_quizzes')
        .select('workspace_quizzes!inner(id, type, content, answer)')
        .eq('module_id', moduleId)
        .eq('quiz_id', quizId)
        .maybeSingle();

      const quiz = firstJoined(moduleQuiz?.workspace_quizzes);

      if (quizErr || !quiz) {
        return NextResponse.json(
          { message: 'Quiz not found' },
          { status: 404 }
        );
      }

      let correctAnswerFeedback: Json | null = null;
      let isCorrect = false;

      if (!quiz.type || quiz.type === 'multiple_choice') {
        if (!selectedOptionId) {
          return NextResponse.json(
            {
              message:
                'selectedOptionId is required for multiple choice quizzes',
            },
            { status: 400 }
          );
        }

        const isOptionUuid = UUID_REGEX.test(selectedOptionId);

        if (isOptionUuid) {
          const { data: option, error: optionErr } = await sbAdmin
            .from('quiz_options')
            .select('is_correct')
            .eq('id', selectedOptionId)
            .eq('quiz_id', quizId)
            .maybeSingle();

          if (optionErr || !option) {
            return NextResponse.json(
              { message: 'Quiz option not found' },
              { status: 400 }
            );
          }

          isCorrect = option.is_correct;
          correctAnswerFeedback = await multipleChoiceFeedback({
            correctAnswer: null,
            quizId,
            sbAdmin,
          });
        } else {
          const correctAnswer = await loadCorrectAnswer({
            fallbackAnswer: quiz.answer,
            quizId,
            sbAdmin,
          });

          const correctIndex = asRecord(correctAnswer)?.correctIndex;
          const selectedIndex =
            asRecord(answer)?.selectedIndex ??
            (typeof answer === 'number' ? answer : null);
          isCorrect =
            correctIndex !== undefined &&
            selectedIndex !== null &&
            Number(correctIndex) === Number(selectedIndex);
          correctAnswerFeedback = await multipleChoiceFeedback({
            correctAnswer,
            quizId,
            sbAdmin,
          });
        }
      } else if (quiz.type === 'true_false') {
        const correctAnswer = await loadCorrectAnswer({
          fallbackAnswer: quiz.answer,
          quizId,
          sbAdmin,
        });

        const clientCorrect =
          typeof answer === 'boolean' ? answer : asRecord(answer)?.correct;
        const correctKey =
          typeof correctAnswer === 'boolean'
            ? correctAnswer
            : booleanProperty(correctAnswer, 'correct');
        isCorrect = clientCorrect === correctKey;
        correctAnswerFeedback =
          typeof correctKey === 'boolean' ? { correct: correctKey } : null;
      } else if (quiz.type === 'ordering') {
        const correctAnswer = await loadCorrectAnswer({
          fallbackAnswer: quiz.answer,
          quizId,
          sbAdmin,
        });
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
        const correctAnswer = await loadCorrectAnswer({
          fallbackAnswer: quiz.answer,
          quizId,
          sbAdmin,
        });
        const correctPairs = getMatchingPairs(correctAnswer);
        const submittedPairs = getMatchingPairs(answer);
        const fallbackPairs =
          correctPairs.length > 0
            ? correctPairs
            : getMatchingPairs(quiz.content);

        isCorrect =
          fallbackPairs.length > 0 &&
          matchingPairsMatch(submittedPairs, fallbackPairs);
      }

      const isOptionUuid = !!(
        selectedOptionId && UUID_REGEX.test(selectedOptionId)
      );

      const { data: submission, error: insertErr } = await sbAdmin
        .from('course_module_quiz_submissions')
        .upsert(
          {
            module_id: moduleId,
            quiz_id: quizId,
            user_id: subject.studentPlatformUserId,
            selected_option_id: isOptionUuid ? selectedOptionId : null,
            answer: submissionAnswer(answer),
            is_correct: isCorrect,
          },
          { onConflict: 'module_id,quiz_id,user_id' }
        )
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      return NextResponse.json({
        id: submission.id,
        correct_answer: correctAnswerFeedback,
        is_correct: isCorrect,
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to submit quiz response:', error);
      return NextResponse.json(
        { message: 'Failed to submit response' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

export const DELETE = withSessionAuth<Params>(
  async (
    request,
    { supabase, user },
    { courseId: _courseId, moduleId, wsId }
  ) => {
    try {
      const subject = await resolveTulearnSubject({
        requestSupabase: supabase,
        studentId: request.nextUrl.searchParams.get('studentId'),
        user,
        wsId,
      });

      if (subject.readOnly) {
        return NextResponse.json(
          { message: 'Guest/Parent accounts are read-only' },
          { status: 403 }
        );
      }

      const sbAdmin = await createAdminClient();

      const { error } = await sbAdmin
        .from('course_module_quiz_submissions')
        .delete()
        .eq('module_id', moduleId)
        .eq('user_id', subject.studentPlatformUserId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      console.error('Failed to reset quiz submissions:', error);
      return NextResponse.json(
        { message: 'Failed to reset submissions' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
