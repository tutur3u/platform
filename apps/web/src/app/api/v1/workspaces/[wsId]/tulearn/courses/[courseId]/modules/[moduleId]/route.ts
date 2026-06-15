import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
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

const QuizSubmissionPayloadSchema = z.object({
  quizId: z.string().uuid(),
  selectedOptionId: z.string().nullable().optional(),
  answer: z.any().optional(),
});

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
        .select('quiz_id, selected_option_id, answer, is_correct')
        .eq('module_id', moduleId)
        .eq('user_id', subject.studentPlatformUserId);

      if (subError) throw subError;

      return NextResponse.json({
        ...module,
        submissions: submissions || [],
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to load Tulearn module:', error);
      return NextResponse.json(
        { message: 'Failed to load module' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

export const POST = withSessionAuth<Params>(
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
      console.log('--- tulearn quiz submission body:', body);
      if (!parsedBody.success) {
        console.log('--- schema validation failed:', parsedBody.error.issues);
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsedBody.error.issues },
          { status: 400 }
        );
      }

      const { quizId, selectedOptionId, answer } = parsedBody.data;
      const sbAdmin = await createAdminClient();

      const { data: quiz, error: quizErr } = await sbAdmin
        .from('workspace_quizzes')
        .select('type, answer')
        .eq('id', quizId)
        .maybeSingle();

      if (quizErr || !quiz) {
        return NextResponse.json(
          { message: 'Quiz not found' },
          { status: 404 }
        );
      }

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

        const isOptionUuid =
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
            selectedOptionId
          );

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
        } else {
          let correctAnswer = quiz.answer;
          if (!correctAnswer) {
            const { data: privateAnswer } = await sbAdmin
              .schema('private')
              .from('workspace_quiz_answers')
              .select('answer')
              .eq('quiz_id', quizId)
              .maybeSingle();
            if (privateAnswer) {
              correctAnswer = privateAnswer.answer;
            }
          }

          const correctIndex = (correctAnswer as any)?.correctIndex;
          const selectedIndex =
            (answer as any)?.selectedIndex ??
            (typeof answer === 'number' ? answer : null);
          isCorrect =
            correctIndex !== undefined &&
            selectedIndex !== null &&
            Number(correctIndex) === Number(selectedIndex);
        }
      } else if (quiz.type === 'true_false') {
        let correctAnswer = quiz.answer;
        if (!correctAnswer) {
          const { data: privateAnswer } = await sbAdmin
            .schema('private')
            .from('workspace_quiz_answers')
            .select('answer')
            .eq('quiz_id', quizId)
            .maybeSingle();
          if (privateAnswer) {
            correctAnswer = privateAnswer.answer;
          }
        }

        const clientCorrect =
          typeof answer === 'boolean' ? answer : (answer as any)?.correct;
        const correctKey = (correctAnswer as any)?.correct;
        isCorrect = clientCorrect === correctKey;
      } else if (quiz.type === 'ordering') {
        let correctAnswer = quiz.answer;
        if (!correctAnswer) {
          const { data: privateAnswer } = await sbAdmin
            .schema('private')
            .from('workspace_quiz_answers')
            .select('answer')
            .eq('quiz_id', quizId)
            .maybeSingle();
          if (privateAnswer) {
            correctAnswer = privateAnswer.answer;
          }
        }

        const correctOrder = Array.isArray(correctAnswer)
          ? correctAnswer
          : (correctAnswer as any)?.order;
        const submittedOrder = Array.isArray(answer)
          ? answer
          : (answer as any)?.order;

        if (Array.isArray(correctOrder) && Array.isArray(submittedOrder)) {
          isCorrect =
            correctOrder.length === submittedOrder.length &&
            correctOrder.every((val, idx) => val === submittedOrder[idx]);
        } else {
          isCorrect = false;
        }
      } else if (quiz.type === 'matching') {
        isCorrect = true;
      }

      const isOptionUuid = !!(
        selectedOptionId &&
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
          selectedOptionId
        )
      );

      const { data: submission, error: insertErr } = await sbAdmin
        .from('course_module_quiz_submissions')
        .insert({
          module_id: moduleId,
          quiz_id: quizId,
          user_id: subject.studentPlatformUserId,
          selected_option_id: isOptionUuid ? selectedOptionId : null,
          answer: answer !== undefined ? answer : null,
          is_correct: isCorrect,
        })
        .select('id')
        .single();

      if (insertErr) throw insertErr;

      return NextResponse.json({
        id: submission.id,
        is_correct: isCorrect,
      });
    } catch (error) {
      const accessResponse = tulearnAccessErrorResponse(error);
      if (accessResponse) return accessResponse;

      serverLogger.error('Failed to submit quiz response:', error);
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

      serverLogger.error('Failed to reset quiz submissions:', error);
      return NextResponse.json(
        { message: 'Failed to reset submissions' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
