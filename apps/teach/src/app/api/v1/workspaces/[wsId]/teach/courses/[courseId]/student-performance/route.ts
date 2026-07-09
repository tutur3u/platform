import {
  requireTeachWorkspaceAccess,
  validateTeachCourse,
} from '@tuturuuu/education-core/teach/api';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const RouteParamsSchema = z.object({
  courseId: z.guid(),
  wsId: z.string().min(1),
});

export interface StudentPerformanceStat {
  userId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  // Overall quiz stats across all modules
  totalQuizzes: number;
  answeredCount: number;
  correctCount: number;
  pendingGradingCount: number; // is_correct === null
  scorePercent: number | null; // null if no answered quizzes
  // Module completion
  totalModules: number;
  completedModules: number; // modules where student has submitted all quizzes
  // Activity
  lastActivityAt: string | null;
  // Risk flags
  isLowScorer: boolean; // < 50% correct
  hasNotSubmitted: boolean; // 0 answers submitted
}

export interface CourseStudentPerformanceResponse {
  students: StudentPerformanceStat[];
  totalModules: number;
  totalQuizzes: number;
}

export const GET = withSessionAuth(
  async (
    _request,
    context,
    params:
      | { wsId: string; courseId: string }
      | Promise<{ wsId: string; courseId: string }>
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

      const { wsId, courseId } = parsedParams.data;

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'view_user_groups',
        wsId,
      });
      if (access instanceof NextResponse) return access;

      const normalizedWsId = access.normalizedWsId;

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

      // 1. Get all members of this course (same table as the members API)
      const { data: members } = await access.sbAdmin
        .from('workspace_user_groups_users')
        .select(
          `user_id,
           profile:workspace_users!workspace_user_roles_users_user_id_fkey(id, display_name, full_name, email, avatar_url)`
        )
        .eq('group_id', courseId);

      if (!members || members.length === 0) {
        return NextResponse.json({
          students: [],
          totalModules: 0,
          totalQuizzes: 0,
        } satisfies CourseStudentPerformanceResponse);
      }

      // 2. Get all modules for this course
      const { data: modules } = await access.sbAdmin
        .from('workspace_course_modules')
        .select('id')
        .eq('group_id', courseId);

      const moduleIds = (modules ?? []).map((m) => m.id);
      const totalModules = moduleIds.length;

      // 3. Get total quizzes across all modules
      const { count: totalQuizzes } = moduleIds.length
        ? await access.sbAdmin
            .from('course_module_quizzes')
            .select('id', { count: 'exact', head: true })
            .in('module_id', moduleIds)
        : { count: 0 };

      // 4. Get quiz IDs per module (for total count per student row)
      const { data: quizCounts } = moduleIds.length
        ? await access.sbAdmin
            .from('course_module_quizzes')
            .select('module_id, quiz_id')
            .in('module_id', moduleIds)
        : { data: [] };

      const quizzesPerModule: Record<string, number> = {};
      for (const q of quizCounts ?? []) {
        quizzesPerModule[q.module_id] =
          (quizzesPerModule[q.module_id] ?? 0) + 1;
      }

      // 5. Get all submissions for all modules
      const { data: submissions } = moduleIds.length
        ? await access.sbAdmin
            .from('course_module_quiz_submissions')
            .select('user_id, module_id, quiz_id, is_correct, created_at')
            .in('module_id', moduleIds)
        : { data: [] };

      // Get user links to map platform_user_id (from submissions) to virtual_user_id (from course membership)
      const { data: userLinks } = await access.sbAdmin
        .from('workspace_user_linked_users')
        .select('platform_user_id, virtual_user_id')
        .eq('ws_id', normalizedWsId);

      const platformToVirtual = new Map<string, string>();
      for (const link of userLinks ?? []) {
        platformToVirtual.set(link.platform_user_id, link.virtual_user_id);
      }

      // 6. Build per-student stats
      type SubRow = {
        user_id: string;
        module_id: string;
        quiz_id: string;
        is_correct: boolean | null;
        created_at: string;
      };

      const subsByUser: Record<string, SubRow[]> = {};
      for (const sub of (submissions ?? []) as SubRow[]) {
        const virtualId = platformToVirtual.get(sub.user_id) ?? sub.user_id;
        if (!subsByUser[virtualId]) subsByUser[virtualId] = [];
        subsByUser[virtualId]!.push(sub);
      }

      const students: StudentPerformanceStat[] = members.map((m) => {
        const profile = (
          Array.isArray(m.profile) ? m.profile[0] : m.profile
        ) as {
          id: string;
          display_name: string | null;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
        } | null;

        const subs = subsByUser[m.user_id] ?? [];
        const answeredCount = subs.length;
        const correctCount = subs.filter((s) => s.is_correct === true).length;
        const pendingGradingCount = subs.filter(
          (s) => s.is_correct === null
        ).length;

        // Score: only grade non-pending ones
        const gradedCount = answeredCount - pendingGradingCount;
        const scorePercent =
          gradedCount > 0
            ? Math.round((correctCount / gradedCount) * 100)
            : answeredCount > 0
              ? null // all pending
              : null;

        // Module completion: student submitted every quiz in the module.
        const submittedQuizIdsByModule = new Map<string, Set<string>>();
        for (const sub of subs) {
          if (!submittedQuizIdsByModule.has(sub.module_id)) {
            submittedQuizIdsByModule.set(sub.module_id, new Set());
          }
          submittedQuizIdsByModule.get(sub.module_id)!.add(sub.quiz_id);
        }
        const completedModules = moduleIds.filter((mid) => {
          const totalModuleQuizzes = quizzesPerModule[mid] ?? 0;
          if (totalModuleQuizzes === 0) return true;
          return (
            (submittedQuizIdsByModule.get(mid)?.size ?? 0) >= totalModuleQuizzes
          );
        }).length;

        const lastActivityAt =
          subs.length > 0
            ? subs.reduce((latest, s) =>
                s.created_at > latest.created_at ? s : latest
              ).created_at
            : null;

        return {
          userId: m.user_id,
          displayName: profile?.display_name ?? profile?.full_name ?? null,
          email: profile?.email ?? null,
          avatarUrl: profile?.avatar_url ?? null,
          totalQuizzes: totalQuizzes ?? 0,
          answeredCount,
          correctCount,
          pendingGradingCount,
          scorePercent,
          totalModules,
          completedModules,
          lastActivityAt,
          isLowScorer: scorePercent !== null && scorePercent < 50,
          hasNotSubmitted: answeredCount === 0,
        };
      });

      // Sort: most at-risk first (no submission → low score → pending → by score asc)
      students.sort((a, b) => {
        if (a.hasNotSubmitted !== b.hasNotSubmitted)
          return a.hasNotSubmitted ? -1 : 1;
        if (a.isLowScorer !== b.isLowScorer) return a.isLowScorer ? -1 : 1;
        if (a.pendingGradingCount !== b.pendingGradingCount)
          return b.pendingGradingCount - a.pendingGradingCount;
        return (a.scorePercent ?? 101) - (b.scorePercent ?? 101);
      });

      return NextResponse.json({
        students,
        totalModules,
        totalQuizzes: totalQuizzes ?? 0,
      } satisfies CourseStudentPerformanceResponse);
    } catch (error) {
      console.error('Failed to load student performance:', error);
      return NextResponse.json(
        { message: 'Failed to load student performance' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 120, windowMs: 60000 },
  }
);
