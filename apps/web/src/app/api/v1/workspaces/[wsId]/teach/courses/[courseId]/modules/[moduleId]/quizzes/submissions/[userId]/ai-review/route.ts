import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
  validateTeachCourseModule,
} from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  moduleId: z.guid(),
  userId: z.guid(),
  wsId: z.string().min(1),
});

const RequestBodySchema = z.object({
  quizId: z.guid(),
});

const ReviewResultSchema = z.object({
  explanation: z.string(),
  suggested_is_correct: z.boolean().nullable(),
});

type RouteParams = {
  wsId: string;
  courseId: string;
  moduleId: string;
  userId: string;
};

export const POST = withSessionAuth(
  async (
    request,
    context,
    params: RouteParams | Promise<RouteParams>
  ) => {
    try {
      const resolvedParams = await Promise.resolve(params);
      const parsedParams = RouteParamsSchema.safeParse(resolvedParams);
      if (!parsedParams.success) {
        return NextResponse.json(
          {
            message: 'Invalid route params',
            errors: parsedParams.error.issues,
          },
          { status: 400 }
        );
      }

      const { wsId, courseId, moduleId, userId } = parsedParams.data;

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'view_user_groups',
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

      const module = await validateTeachCourseModule({
        courseId,
        db: access.sbAdmin,
        moduleId,
      });
      if (!module) {
        return NextResponse.json(
          { message: 'Module not found' },
          { status: 404 }
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
          {
            message: 'Invalid request body',
            errors: parsedBody.error.issues,
          },
          { status: 400 }
        );
      }

      const { quizId } = parsedBody.data;

      // 1. Fetch quiz content and correct answer
      const { data: quiz, error: quizError } = await access.sbAdmin
        .from('workspace_quizzes')
        .select('question, type, content, answer')
        .eq('id', quizId)
        .maybeSingle();

      if (quizError || !quiz) {
        return NextResponse.json(
          { message: 'Quiz not found' },
          { status: 404 }
        );
      }

      // 2. Fetch student's submission
      const { data: submission, error: subError } = await access.sbAdmin
        .from('course_module_quiz_submissions')
        .select('answer, selected_option_id, is_correct')
        .eq('module_id', moduleId)
        .eq('quiz_id', quizId)
        .eq('user_id', userId)
        .maybeSingle();

      if (subError || !submission) {
        return NextResponse.json(
          { message: 'Student submission not found' },
          { status: 404 }
        );
      }

      // 3. Fetch multiple choice options if applicable
      let options: unknown[] = [];
      if (quiz.type === 'multiple_choice') {
        const { data: quizOptions } = await access.sbAdmin
          .from('quiz_options')
          .select('id, value, is_correct, explanation')
          .eq('quiz_id', quizId);
        options = quizOptions ?? [];
      }

      // 4. Construct prompt for AI
      const prompt = `
You are an expert AI teaching assistant. Your task is to evaluate and explain a student's answer to a quiz question.

Question details:
- Question: ${quiz.question}
- Question Type: ${quiz.type}
- Quiz Options (if multiple choice): ${JSON.stringify(options)}
- Correct Answer Reference: ${JSON.stringify(quiz.answer)}

Student Submission details:
- Student's Answer: ${JSON.stringify(submission.answer)}
- Selected Option ID (if multiple choice): ${submission.selected_option_id}
- System Auto-grade Result: ${submission.is_correct === true ? 'Correct' : submission.is_correct === false ? 'Incorrect' : 'Pending review'}

Instructions:
1. Provide a concise, constructive, and friendly explanation (2-3 sentences max) explaining why the student's answer is correct or incorrect, or helping them understand the correct concept.
2. For paragraph questions only: Suggest whether the student's answer is correct (true) or incorrect (false) by comparing it to the correct answer reference/rubric. Set suggested_is_correct to true or false.
3. For multiple choice/true_false/other auto-graded questions: Set suggested_is_correct to null.
`;

      const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: ReviewResultSchema,
        prompt,
      });

      // Persist the generated AI feedback to the database submission record
      await access.sbAdmin
        .from('course_module_quiz_submissions')
        .update({
          ai_feedback: object.explanation,
        })
        .eq('module_id', moduleId)
        .eq('quiz_id', quizId)
        .eq('user_id', userId);

      return NextResponse.json(object);
    } catch (error) {
      console.error('Failed to perform AI submission review:', error);
      return NextResponse.json(
        { message: 'Failed to perform AI review' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 60, windowMs: 60000 },
  }
);
