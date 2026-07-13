import { google } from '@ai-sdk/google';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { withAiMemory } from '@tuturuuu/ai/memory';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@tuturuuu/education-core/teach/api';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const RouteParamsSchema = z.object({
  attemptId: z.guid(),
  courseId: z.guid(),
  testId: z.guid(),
  wsId: z.string().min(1),
});

const RequestBodySchema = z.object({
  quizId: z.guid(),
});

const FeedbackResultSchema = z.object({
  feedback: z.string().min(1),
});

const FEEDBACK_MODEL_ID = 'google/gemini-2.5-flash';
const FEEDBACK_MODEL_NAME = 'gemini-2.5-flash';
const FEEDBACK_CREDIT_FEATURE = 'generate';
const FEEDBACK_TIMEOUT_MS = 20_000;

type RouteParams = z.infer<typeof RouteParamsSchema>;

export const POST = withSessionAuth(
  async (request, context, params: RouteParams | Promise<RouteParams>) => {
    try {
      const parsedParams = RouteParamsSchema.safeParse(await params);
      if (!parsedParams.success) {
        return NextResponse.json(
          {
            message: 'Invalid route params',
            errors: parsedParams.error.issues,
          },
          { status: 400 }
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

      const parsedBody = RequestBodySchema.safeParse(body);
      if (!parsedBody.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const { attemptId, courseId, testId, wsId } = parsedParams.data;
      const { quizId } = parsedBody.data;
      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'update_user_groups',
        wsId,
      });
      if (access instanceof NextResponse) return access;

      const course = await validateTeachCourse({
        courseId,
        db: access.sbAdmin,
        wsId: access.normalizedWsId,
      });
      if (!course) {
        return NextResponse.json(
          { message: 'Course not found' },
          { status: 404 }
        );
      }

      const { data: test, error: testError } = await access.sbAdmin
        .from('course_tests')
        .select('id')
        .eq('id', testId)
        .eq('course_id', courseId)
        .maybeSingle();
      if (testError) throw testError;
      if (!test) {
        return NextResponse.json(
          { message: 'Test not found' },
          { status: 404 }
        );
      }

      const { data: attempt, error: attemptError } = await access.sbAdmin
        .from('course_test_attempts')
        .select('id')
        .eq('id', attemptId)
        .eq('test_id', testId)
        .maybeSingle();
      if (attemptError) throw attemptError;
      if (!attempt) {
        return NextResponse.json(
          { message: 'Attempt not found' },
          { status: 404 }
        );
      }

      const { data: testQuiz, error: testQuizError } = await access.sbAdmin
        .from('course_test_quizzes')
        .select('quiz_id')
        .eq('test_id', testId)
        .eq('quiz_id', quizId)
        .maybeSingle();
      if (testQuizError) throw testQuizError;
      if (!testQuiz) {
        return NextResponse.json(
          { message: 'Quiz not found for test' },
          { status: 404 }
        );
      }

      const { data: quiz, error: quizError } = await access.sbAdmin
        .from('workspace_quizzes')
        .select(
          'question, type, content, answer, quiz_options(id, value, is_correct, explanation)'
        )
        .eq('id', quizId)
        .eq('ws_id', access.normalizedWsId)
        .maybeSingle();
      if (quizError) throw quizError;
      if (!quiz) {
        return NextResponse.json(
          { message: 'Quiz not found' },
          { status: 404 }
        );
      }

      const { data: submission, error: submissionError } = await access.sbAdmin
        .from('course_test_attempt_answers')
        .select('answer, selected_option_id, is_correct')
        .eq('attempt_id', attemptId)
        .eq('quiz_id', quizId)
        .maybeSingle();
      if (submissionError) throw submissionError;
      if (!submission) {
        return NextResponse.json(
          { message: 'Student answer not found' },
          { status: 404 }
        );
      }

      const creditCheck = await checkAiCredits(
        access.normalizedWsId,
        FEEDBACK_MODEL_ID,
        FEEDBACK_CREDIT_FEATURE,
        { userId: context.user.id }
      );
      if (!creditCheck.allowed) {
        return NextResponse.json(
          {
            code: creditCheck.errorCode,
            message: creditCheck.errorMessage || 'AI credits insufficient',
          },
          { status: 403 }
        );
      }

      const cappedMaxOutput = await capMaxOutputTokensByCredits(
        access.sbAdmin,
        FEEDBACK_MODEL_ID,
        creditCheck.maxOutputTokens ?? null,
        creditCheck.remainingCredits
      );
      if (cappedMaxOutput === null && creditCheck.remainingCredits <= 0) {
        return NextResponse.json(
          { code: 'CREDITS_EXHAUSTED', message: 'AI credits insufficient' },
          { status: 403 }
        );
      }

      const studentAnswer =
        submission.answer ?? submission.selected_option_id ?? null;
      const prompt = `
You are an expert AI teaching assistant. Evaluate and explain a student's answer to help an instructor provide useful feedback.

Question details:
- Question: ${quiz.question}
- Question Type: ${quiz.type}
- Quiz Content: ${JSON.stringify(quiz.content)}
- Quiz Options: ${JSON.stringify(quiz.quiz_options ?? [])}
- Correct Answer Reference: ${JSON.stringify(quiz.answer)}

Student submission details:
- Student's Answer: ${JSON.stringify(studentAnswer)}
- System Auto-grade Result: ${submission.is_correct === true ? 'Correct' : submission.is_correct === false ? 'Incorrect' : 'Pending review'}

Provide a concise, constructive explanation of 2-3 sentences in the language of the question. Explain why the answer is correct or incorrect, or clarify the relevant concept.
`;

      let result: z.infer<typeof FeedbackResultSchema>;
      let usage:
        | {
            inputTokens?: number;
            outputTokens?: number;
            outputTokenDetails?: { reasoningTokens?: number };
          }
        | undefined;
      try {
        const generation = await generateObject({
          abortSignal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
          ...(cappedMaxOutput ? { maxOutputTokens: cappedMaxOutput } : {}),
          model: await withAiMemory({
            customId: `test-feedback-${attemptId}-${quizId}-${Date.now()}`,
            model: google(FEEDBACK_MODEL_NAME),
            product: 'teach',
            source: 'test_submission_feedback',
            surface: 'test_submission_feedback',
            userId: context.user.id,
            wsId: access.normalizedWsId,
          }),
          prompt,
          schema: FeedbackResultSchema,
        });
        result = generation.object;
        usage = generation.usage;
      } catch (error) {
        if (isAbortError(error)) {
          return NextResponse.json(
            { message: 'AI feedback generation timed out' },
            { status: 504 }
          );
        }
        throw error;
      }

      deductAiCredits({
        feature: FEEDBACK_CREDIT_FEATURE,
        inputTokens: usage?.inputTokens ?? 0,
        metadata: {
          attemptId,
          quizId,
          source: 'test_submission_feedback',
          testId,
        },
        modelId: FEEDBACK_MODEL_ID,
        outputTokens: usage?.outputTokens ?? 0,
        reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
        userId: context.user.id,
        wsId: access.normalizedWsId,
      }).catch((error: unknown) =>
        console.warn('Failed to deduct test feedback AI credits', {
          attemptId,
          error,
          quizId,
          userId: context.user.id,
          wsId: access.normalizedWsId,
        })
      );

      return NextResponse.json(result);
    } catch (error) {
      console.error('Failed to generate test submission AI feedback:', error);
      return NextResponse.json(
        { message: 'Failed to generate AI feedback' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 30, windowMs: 60_000 },
  }
);

function isAbortError(error: unknown) {
  return (
    (error instanceof Error || error instanceof DOMException) &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}
