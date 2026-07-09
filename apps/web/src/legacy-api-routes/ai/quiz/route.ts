import { randomUUID } from 'node:crypto';
import { google } from '@ai-sdk/google';
import { capMaxOutputTokensByCredits } from '@tuturuuu/ai/credits/cap-output-tokens';
import {
  checkAiCredits,
  deductAiCredits,
} from '@tuturuuu/ai/credits/check-credits';
import { withAiMemory } from '@tuturuuu/ai/memory';
import { setPrivateWorkspaceQuizAnswer } from '@tuturuuu/education-core/education/private-quiz-answers';
import { revalidateCourseModuleQuizPaths } from '@tuturuuu/education-core/education/revalidate-quiz-paths';
import { requireTeachWorkspaceAccess } from '@tuturuuu/education-core/teach/api';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Json } from '@tuturuuu/types';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  GenerateQuizRequestSchema,
  QUIZ_GENERATION_PROMPT,
  QuizGenerationSchema,
} from './schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUIZ_GENERATION_MODEL_ID = 'google/gemini-2.5-flash';
const QUIZ_GENERATION_MODEL_NAME = 'gemini-2.5-flash';
const QUIZ_GENERATION_CREDIT_FEATURE = 'generate';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractTextFromContent(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  const record = asRecord(content);
  if (typeof record?.text === 'string') return record.text;
  if (Array.isArray(record?.content)) {
    return record.content.map(extractTextFromContent).join(' ');
  }
  return '';
}

async function cleanupQuizzes(quizIds: string[], sbAdmin: TypedSupabaseClient) {
  if (quizIds.length === 0) return;
  try {
    await sbAdmin.from('course_module_quizzes').delete().in('quiz_id', quizIds);
    await sbAdmin.from('workspace_quizzes').delete().in('id', quizIds);
  } catch (error) {
    console.error('Failed to clean up generated quizzes', {
      error,
      quizIds,
    });
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export const POST = withSessionAuth(
  async (request, context) => {
    try {
      if (!context.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Parse & validate request body
      let rawBody: unknown;
      try {
        rawBody = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      const parsedBody = GenerateQuizRequestSchema.safeParse(rawBody);
      if (!parsedBody.success) {
        return NextResponse.json(
          { error: 'Invalid request body', issues: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const {
        lessonId,
        testId,
        wsId,
        context: teacherContext,
        difficulty,
        questionType,
        count,
      } = parsedBody.data;

      // Require teach workspace access
      const access = await requireTeachWorkspaceAccess({
        context,
        permission: ['update_user_groups', 'view_user_groups'],
        wsId,
      });
      if (access instanceof NextResponse) return access;

      const normalizedWsId = access.normalizedWsId;
      const sbAdmin = access.sbAdmin as TypedSupabaseClient;

      // Fetch the lesson (course module)
      const { data: lesson, error: lessonError } = await sbAdmin
        .from('workspace_course_modules')
        .select(
          'id, name, content, extra_content, youtube_links, workspace_user_groups!inner(ws_id)'
        )
        .eq('id', lessonId)
        .eq('workspace_user_groups.ws_id', normalizedWsId)
        .maybeSingle();

      if (lessonError) {
        return NextResponse.json(
          { error: 'Failed to verify lesson', message: lessonError.message },
          { status: 500 }
        );
      }

      if (!lesson) {
        return NextResponse.json(
          { error: 'Lesson not found' },
          { status: 404 }
        );
      }

      const lessonText = extractTextFromContent(lesson.content);
      const extraText = lesson.extra_content
        ? extractTextFromContent(lesson.extra_content)
        : '';

      const lessonInfo = `Lesson Title: ${lesson.name}\n\nLesson Content:\n${lessonText}\n\nExtra Content:\n${extraText}`;

      const typeInstruction =
        questionType === 'mix'
          ? 'Generate a mix of question types (multiple_choice, true_false, matching, ordering, paragraph).'
          : `Generate ONLY questions of type "${questionType}".`;
      const difficultyInstruction = `Requested difficulty level: ${difficulty}. Keep every generated question aligned with this difficulty.`;

      const promptText = `Analyze the following lesson content to create exactly ${count} structured quiz questions.
${typeInstruction}
${difficultyInstruction}

${teacherContext?.trim() ? `Additional context/instructions: ${teacherContext.trim()}\n` : ''}
Lesson Information:
${lessonInfo}`;

      const creditCheck = await checkAiCredits(
        normalizedWsId,
        QUIZ_GENERATION_MODEL_ID,
        QUIZ_GENERATION_CREDIT_FEATURE,
        { userId: context.user.id }
      );

      if (!creditCheck.allowed) {
        return NextResponse.json(
          {
            error: creditCheck.errorMessage || 'AI credits insufficient',
            code: creditCheck.errorCode,
          },
          { status: 403 }
        );
      }

      const cappedMaxOutput = await capMaxOutputTokensByCredits(
        sbAdmin,
        QUIZ_GENERATION_MODEL_ID,
        creditCheck.maxOutputTokens ?? null,
        creditCheck.remainingCredits
      );

      if (cappedMaxOutput === null && creditCheck.remainingCredits <= 0) {
        return NextResponse.json(
          { error: 'AI credits insufficient', code: 'CREDITS_EXHAUSTED' },
          { status: 403 }
        );
      }

      // Generate structured quizzes via AI SDK
      const { object, usage } = await generateObject({
        model: await withAiMemory({
          customId: `quiz-generation-${Date.now()}`,
          model: google(QUIZ_GENERATION_MODEL_NAME),
          product: 'teach',
          source: 'quiz_generation',
          surface: 'quiz_generation',
          userId: context.user.id,
          wsId: normalizedWsId,
        }),
        schema: QuizGenerationSchema,
        system: QUIZ_GENERATION_PROMPT,
        prompt: promptText,
        ...(cappedMaxOutput ? { maxOutputTokens: cappedMaxOutput } : {}),
      });

      deductAiCredits({
        wsId: normalizedWsId,
        userId: context.user.id,
        modelId: QUIZ_GENERATION_MODEL_ID,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
        feature: QUIZ_GENERATION_CREDIT_FEATURE,
        metadata: {
          count,
          difficulty,
          lessonId,
          questionType,
          source: 'quiz_generation',
        },
      }).catch((error: unknown) =>
        console.warn('Failed to deduct quiz generation AI credits', {
          error,
          lessonId,
          userId: context.user.id,
          wsId: normalizedWsId,
        })
      );

      if (!object.quizzes || object.quizzes.length === 0) {
        return NextResponse.json(
          { error: 'No quizzes generated' },
          { status: 500 }
        );
      }

      const createdQuizIds: string[] = [];

      try {
        // Map and insert quizzes into database
        const quizPayloads = object.quizzes.map((quiz) => {
          let content: Json = {};
          let answer: Json = {};

          if (quiz.type === 'true_false') {
            content = {};
            answer = { correct: quiz.correct_boolean ?? false };
          } else if (quiz.type === 'multiple_choice') {
            content = { options: quiz.options ?? [] };
            answer = { correctIndex: quiz.correct_option_index ?? 0 };
          } else if (quiz.type === 'matching') {
            content = { pairs: quiz.matching_pairs ?? [] };
            answer = { pairs: quiz.matching_pairs ?? [] };
          } else if (quiz.type === 'ordering') {
            content = { items: quiz.ordering_items ?? [] };
            answer = { order: quiz.ordering_items ?? [] };
          } else if (quiz.type === 'paragraph') {
            content = {};
            answer = {};
          }

          return {
            answer,
            quiz: {
              id: randomUUID(),
              question: quiz.question,
              type: quiz.type,
              content,
              score: quiz.score,
              ws_id: normalizedWsId,
            },
          };
        });

        const { error: quizError } = await sbAdmin
          .from('workspace_quizzes')
          .insert(quizPayloads.map(({ quiz }) => quiz));

        if (quizError) {
          throw quizError;
        }

        const createdQuizzes = quizPayloads.map(({ quiz }) => ({
          id: quiz.id,
        }));
        createdQuizIds.push(...createdQuizzes.map((q) => q.id));

        await Promise.all(
          quizPayloads.map(({ answer, quiz }) =>
            setPrivateWorkspaceQuizAnswer({
              answer,
              db: sbAdmin,
              quizId: quiz.id,
            })
          )
        );

        if (testId) {
          // Link quizzes to course test
          const { error: linkError } = await sbAdmin
            .from('course_test_quizzes')
            .insert(
              createdQuizzes.map((q) => ({
                test_id: testId,
                module_id: lesson.id,
                quiz_id: q.id,
              }))
            );
          if (linkError) throw linkError;
        } else {
          // Link quizzes to course module
          const { error: linkError } = await sbAdmin
            .from('course_module_quizzes')
            .insert(
              createdQuizzes.map((q) => ({
                module_id: lesson.id,
                quiz_id: q.id,
              }))
            );
          if (linkError) throw linkError;
        }

        await revalidateCourseModuleQuizPaths({
          db: sbAdmin,
          moduleIds: [lesson.id],
          wsId: normalizedWsId,
        });

        return NextResponse.json({
          success: true,
          count: createdQuizzes.length,
          quizzes: createdQuizzes,
        });
      } catch (error) {
        await cleanupQuizzes(createdQuizIds, sbAdmin);
        throw error;
      }
    } catch (error) {
      console.error('Failed to generate quiz', { error });
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: 'teach' }, allowAiTempAuth: true }
);
