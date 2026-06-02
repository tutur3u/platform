import { google } from '@ai-sdk/google';
import { withAiMemory } from '@tuturuuu/ai/memory';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';
import {
  GenerateQuizRequestSchema,
  QUIZ_GENERATION_PROMPT,
  QuizGenerationSchema,
} from './schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTextFromContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (content.text) return content.text;
  if (content.content && Array.isArray(content.content)) {
    return content.content.map(extractTextFromContent).join(' ');
  }
  return '';
}

async function cleanupQuizzes(quizIds: string[], sbAdmin: TypedSupabaseClient) {
  if (quizIds.length === 0) return;
  try {
    await sbAdmin.from('quiz_options').delete().in('quiz_id', quizIds);
    await sbAdmin.from('course_module_quizzes').delete().in('quiz_id', quizIds);
    await sbAdmin.from('workspace_quizzes').delete().in('id', quizIds);
  } catch (error) {
    serverLogger.error('Failed to clean up generated quizzes', {
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

      const { lessonId, wsId, context: teacherContext } = parsedBody.data;

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
          'id, name, content, extra_content, workspace_user_groups!inner(ws_id)'
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

      const trimmedTeacherContext = teacherContext?.trim();
      const promptText = `Analyze the following lesson content and create structured quiz questions.${
        trimmedTeacherContext
          ? `\n\nAdditional context/instructions: ${trimmedTeacherContext}`
          : ''
      }\n\nLesson Information:\n${lessonInfo}`;

      // Generate structured quizzes via AI SDK
      const { object } = await generateObject({
        model: await withAiMemory({
          customId: `quiz-generation-${Date.now()}`,
          model: google('gemini-2.5-flash'),
          product: 'teach',
          source: 'quiz_generation',
          surface: 'quiz_generation',
          userId: context.user.id,
          wsId: normalizedWsId,
        }),
        schema: QuizGenerationSchema,
        system: QUIZ_GENERATION_PROMPT,
        prompt: promptText,
      });

      if (!object.quizzes || object.quizzes.length === 0) {
        return NextResponse.json(
          { error: 'No quizzes generated' },
          { status: 500 }
        );
      }

      const createdQuizIds: string[] = [];

      try {
        // Insert quizzes
        const { data: createdQuizzes, error: quizError } = await sbAdmin
          .from('workspace_quizzes')
          .insert(
            object.quizzes.map((quiz) => ({
              question: quiz.question,
              score: quiz.score,
              ws_id: normalizedWsId,
            }))
          )
          .select('id');

        if (quizError || !createdQuizzes) {
          throw quizError ?? new Error('Failed to create quizzes in database');
        }

        createdQuizIds.push(...createdQuizzes.map((q) => q.id));

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

        // Insert quiz options
        const quizOptions = object.quizzes.flatMap((quiz, quizIndex) => {
          const createdQuiz = createdQuizzes[quizIndex];
          if (!createdQuiz) {
            throw new Error('Generated quiz option mapping failed');
          }
          return quiz.quiz_options.map((option) => ({
            quiz_id: createdQuiz.id,
            value: option.value,
            is_correct: option.is_correct,
            explanation: option.explanation ?? null,
          }));
        });

        if (quizOptions.length) {
          const { error: optionsError } = await sbAdmin
            .from('quiz_options')
            .insert(quizOptions);

          if (optionsError) throw optionsError;
        }

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
      serverLogger.error('Failed to generate quiz', { error });
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
