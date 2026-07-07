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
  wsId: z.string().min(1),
});

type ModuleSubmissionRow = {
  created_at: string;
  is_correct: boolean;
  quiz_id: string;
  user_id: string;
};

export const GET = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; courseId: string; moduleId: string }
      | Promise<{ wsId: string; courseId: string; moduleId: string }>
  ) => {
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

      const { wsId, courseId, moduleId } = parsedParams.data;

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

      const { data: moduleQuizzes, error: moduleQuizzesErr } =
        await access.sbAdmin
          .from('course_module_quizzes')
          .select('quiz_id')
          .eq('module_id', moduleId);

      if (moduleQuizzesErr) {
        console.error('Failed to fetch module quizzes for submissions', {
          error: moduleQuizzesErr,
          moduleId,
          wsId: access.normalizedWsId,
        });
        return NextResponse.json(
          { message: 'Error fetching module quizzes' },
          { status: 500 }
        );
      }

      const totalQuizzes = moduleQuizzes?.length ?? 0;

      const { data: submissions, error: submissionsErr } = await access.sbAdmin
        .from('course_module_quiz_submissions')
        .select('user_id, quiz_id, is_correct, created_at')
        .eq('module_id', moduleId)
        .order('created_at', { ascending: true });

      if (submissionsErr) {
        console.error('Failed to fetch module quiz submissions', {
          error: submissionsErr,
          moduleId,
          wsId: access.normalizedWsId,
        });
        return NextResponse.json(
          { message: 'Error fetching module quiz submissions' },
          { status: 500 }
        );
      }

      if (!submissions || submissions.length === 0) {
        return NextResponse.json({ data: [], count: 0 });
      }

      const typedSubmissions = submissions as ModuleSubmissionRow[];
      const userIds = [...new Set(typedSubmissions.map((row) => row.user_id))];
      const { data: users, error: usersErr } = await access.sbAdmin
        .from('users')
        .select('id, display_name')
        .in('id', userIds);

      if (usersErr) {
        console.error('Failed to fetch quiz submission users', {
          error: usersErr,
          moduleId,
          wsId: access.normalizedWsId,
        });
        return NextResponse.json(
          { message: 'Error fetching quiz submission users' },
          { status: 500 }
        );
      }

      const userMap = new Map(
        (users ?? []).map((user) => [user.id, user.display_name ?? 'Unknown'])
      );

      const grouped = new Map<
        string,
        {
          answeredQuizIds: Set<string>;
          correctCount: number;
          firstSubmittedAt: string;
          lastSubmittedAt: string;
          userId: string;
        }
      >();

      for (const row of typedSubmissions) {
        const existing = grouped.get(row.user_id);
        if (!existing) {
          grouped.set(row.user_id, {
            answeredQuizIds: new Set([row.quiz_id]),
            correctCount: row.is_correct ? 1 : 0,
            firstSubmittedAt: row.created_at,
            lastSubmittedAt: row.created_at,
            userId: row.user_id,
          });
          continue;
        }

        existing.answeredQuizIds.add(row.quiz_id);
        if (row.is_correct) existing.correctCount += 1;
        existing.lastSubmittedAt = row.created_at;
      }

      const data = [...grouped.values()]
        .map((entry) => ({
          answeredCount: entry.answeredQuizIds.size,
          correctCount: entry.correctCount,
          firstSubmittedAt: entry.firstSubmittedAt,
          lastSubmittedAt: entry.lastSubmittedAt,
          totalQuizzes,
          userId: entry.userId,
          userName: userMap.get(entry.userId) ?? 'Unknown',
        }))
        .sort(
          (left, right) =>
            new Date(right.lastSubmittedAt).getTime() -
            new Date(left.lastSubmittedAt).getTime()
        );

      return NextResponse.json({ data, count: data.length });
    } catch (error) {
      console.error('Failed to load module quiz submissions:', error);
      return NextResponse.json(
        { message: 'Failed to load module quiz submissions' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 120, windowMs: 60000 },
  }
);
