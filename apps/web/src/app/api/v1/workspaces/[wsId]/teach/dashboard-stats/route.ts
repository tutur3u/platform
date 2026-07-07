import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { requireTeachWorkspaceAccess } from '@/lib/teach/api';

const RouteParamsSchema = z.object({
  wsId: z.string().min(1),
});

export type TeachDashboardCourseStat = {
  id: string;
  name: string;
  members_count: number;
  modules_count: number;
  pending_grading: number;
  not_submitted: number;
  low_scorers: number;
  starting_date: string | null;
  ending_date: string | null;
};

export type TeachDashboardStatsResponse = {
  courses: TeachDashboardCourseStat[];
  total_pending_grading: number;
  total_not_submitted: number;
  total_low_scorers: number;
};

export const GET = withSessionAuth(
  async (
    _request,
    context,
    params: { wsId: string } | Promise<{ wsId: string }>
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

      const { wsId } = parsedParams.data;

      const access = await requireTeachWorkspaceAccess({
        context,
        permission: 'view_user_groups',
        wsId,
      });
      if (access instanceof NextResponse) return access;

      const normalizedWsId = access.normalizedWsId;

      // 1. Fetch top 5 active courses with member/module counts
      const { data: courses, error: coursesError } = await access.sbAdmin
        .from('user_groups')
        .select('id, name, starting_date, ending_date')
        .eq('ws_id', normalizedWsId)
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(5);

      if (coursesError) throw coursesError;
      if (!courses || courses.length === 0) {
        return NextResponse.json({
          courses: [],
          total_pending_grading: 0,
          total_not_submitted: 0,
          total_low_scorers: 0,
        } satisfies TeachDashboardStatsResponse);
      }

      const courseIds = courses.map((c) => c.id);

      // 2. Get member counts per course
      const { data: memberRows } = await access.sbAdmin
        .from('workspace_user_groups_users')
        .select('group_id, user_id')
        .in('group_id', courseIds);

      const membersByGroup: Record<string, string[]> = {};
      for (const row of memberRows ?? []) {
        if (!membersByGroup[row.group_id]) membersByGroup[row.group_id] = [];
        membersByGroup[row.group_id]!.push(row.user_id);
      }

      // 3. Get module IDs for all these courses
      const { data: moduleRows } = await access.sbAdmin
        .from('workspace_course_modules')
        .select('id, group_id')
        .in('group_id', courseIds);

      const modulesByGroup: Record<string, string[]> = {};
      const moduleToGroup: Record<string, string> = {};
      for (const row of moduleRows ?? []) {
        if (!modulesByGroup[row.group_id]) modulesByGroup[row.group_id] = [];
        modulesByGroup[row.group_id]!.push(row.id);
        moduleToGroup[row.id] = row.group_id;
      }

      const allModuleIds = (moduleRows ?? []).map((r) => r.id);

      // 4. Get quiz submissions for all modules at once
      const { data: submissions } = allModuleIds.length
        ? await access.sbAdmin
            .from('course_module_quiz_submissions')
            .select('user_id, is_correct, module_id')
            .in('module_id', allModuleIds)
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

      // Group submissions by course, using virtual user IDs
      const subsByGroup: Record<
        string,
        { user_id: string; is_correct: boolean | null }[]
      > = {};
      for (const sub of submissions ?? []) {
        const groupId = moduleToGroup[sub.module_id];
        if (!groupId) continue;
        if (!subsByGroup[groupId]) subsByGroup[groupId] = [];
        const virtualId = platformToVirtual.get(sub.user_id) ?? sub.user_id;
        subsByGroup[groupId]!.push({
          user_id: virtualId,
          is_correct: sub.is_correct,
        });
      }

      // 5. Compute stats per course
      const courseStats: TeachDashboardCourseStat[] = courses.map((course) => {
        const members = membersByGroup[course.id] ?? [];
        const modules = modulesByGroup[course.id] ?? [];
        const subs = subsByGroup[course.id] ?? [];

        // Pending grading: null is_correct (paragraph waiting for teacher)
        const pending_grading = subs.filter(
          (s) => s.is_correct === null
        ).length;

        // Not submitted: members with zero submissions
        const submittedUserIds = new Set(subs.map((s) => s.user_id));
        const not_submitted = members.filter(
          (uid) => !submittedUserIds.has(uid)
        ).length;

        // Low scorers: members whose correct rate < 50%
        const scoreByUser: Record<string, { correct: number; total: number }> =
          {};
        for (const sub of subs) {
          if (!scoreByUser[sub.user_id])
            scoreByUser[sub.user_id] = { correct: 0, total: 0 };
          scoreByUser[sub.user_id]!.total++;
          if (sub.is_correct === true) scoreByUser[sub.user_id]!.correct++;
        }
        const low_scorers = Object.values(scoreByUser).filter(
          ({ correct, total }) => total > 0 && correct / total < 0.5
        ).length;

        return {
          id: course.id,
          name: course.name,
          members_count: members.length,
          modules_count: modules.length,
          pending_grading,
          not_submitted,
          low_scorers,
          starting_date: course.starting_date,
          ending_date: course.ending_date,
        };
      });

      return NextResponse.json({
        courses: courseStats,
        total_pending_grading: courseStats.reduce(
          (s, c) => s + c.pending_grading,
          0
        ),
        total_not_submitted: courseStats.reduce(
          (s, c) => s + c.not_submitted,
          0
        ),
        total_low_scorers: courseStats.reduce((s, c) => s + c.low_scorers, 0),
      } satisfies TeachDashboardStatsResponse);
    } catch (error) {
      console.error('Failed to load teach dashboard stats:', error);
      return NextResponse.json(
        { message: 'Failed to load dashboard stats' },
        { status: 500 }
      );
    }
  },
  {
    allowAppSessionAuth: { targetApp: 'teach' },
    rateLimit: { maxRequests: 120, windowMs: 60000 },
  }
);
