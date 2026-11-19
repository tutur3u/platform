import { connection, type NextRequest, NextResponse } from 'next/server';
import { requireLearnerWorkspace } from '@/lib/education/learner-access';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';

const COURSE_LIMIT = 500;
const ATTEMPT_LIMIT = 20;

type CourseProgressRow = {
  id: string;
  workspace_course_modules: { id: string }[] | null;
};

type AttemptPreviewRow = {
  id: string;
  attempt_number: number;
  total_score: number;
  duration_seconds: number | null;
  submitted_at: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  if (!learnerProgressRoutesEnabled()) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
  const { wsId: wsIdParam } = await params;
  const access = await requireLearnerWorkspace(request, wsIdParam);
  if ('error' in access) return access.error;
  const { sbAdmin, userId, wsId, headers } = access;
  const learnerRows = sbAdmin.schema('private');

  const linkResult = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('platform_user_id', userId)
    .eq('ws_id', wsId)
    .maybeSingle();
  if (linkResult.error) {
    return NextResponse.json(
      { message: 'Failed to load learner progress' },
      { status: 500, headers }
    );
  }

  const virtualUserId = linkResult.data?.virtual_user_id;
  let enrolledIds: string[] = [];
  if (virtualUserId) {
    const enrolledResult = await sbAdmin
      .from('workspace_user_groups_users')
      .select('group_id')
      .eq('user_id', virtualUserId);
    if (enrolledResult.error) {
      return NextResponse.json(
        { message: 'Failed to load learner progress' },
        { status: 500, headers }
      );
    }
    enrolledIds = (enrolledResult.data ?? []).map(
      (row: { group_id: string }) => row.group_id
    );
  }

  const [coursesResult, progressResult, attemptsResult, learnerResult] =
    await Promise.all([
      enrolledIds.length === 0
        ? Promise.resolve({ data: [], error: null })
        : sbAdmin
            .from('workspace_user_groups')
            .select('id, workspace_course_modules(id)')
            .in('id', enrolledIds)
            .eq('ws_id', wsId)
            .eq('archived', false)
            .eq('is_guest', false)
            .eq('is_course_published', true)
            .order('created_at', { ascending: false })
            .limit(COURSE_LIMIT),
      learnerRows
        .from('education_learner_module_progress')
        .select('course_id, module_id')
        .eq('ws_id', wsId)
        .eq('user_id', userId),
      learnerRows
        .from('education_learner_quiz_attempts')
        .select(
          'id, attempt_number, total_score, duration_seconds, submitted_at, course_id',
          { count: 'exact' }
        )
        .eq('ws_id', wsId)
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(ATTEMPT_LIMIT),
      sbAdmin
        .from('user_private_details')
        .select('full_name, email')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (
    coursesResult.error ||
    progressResult.error ||
    attemptsResult.error ||
    learnerResult.error
  ) {
    return NextResponse.json(
      { message: 'Failed to load learner progress' },
      { status: 500, headers }
    );
  }

  const completedByCourse = new Map<string, number>();
  for (const row of progressResult.data ?? []) {
    completedByCourse.set(
      row.course_id,
      (completedByCourse.get(row.course_id) ?? 0) + 1
    );
  }

  const learner = learnerResult.data;
  const courses = (coursesResult.data ?? []).map(
    (course: CourseProgressRow) => {
      const total = course.workspace_course_modules?.length ?? 0;
      const completed = Math.min(completedByCourse.get(course.id) ?? 0, total);
      return {
        course_id: course.id,
        completed_modules: completed,
        total_modules: total,
        completion_ratio: total === 0 ? 0 : completed / total,
      };
    }
  );

  return NextResponse.json(
    {
      courses,
      attempt_count: attemptsResult.count ?? 0,
      attempts: (attemptsResult.data ?? []).map(
        (attempt: AttemptPreviewRow) => ({
          id: attempt.id,
          attempt_number: attempt.attempt_number,
          total_score: attempt.total_score,
          duration_seconds: attempt.duration_seconds,
          submitted_at: attempt.submitted_at,
          completed_at: attempt.submitted_at,
          set_id: null,
          set_name: null,
          user_id: userId,
          learner_name: learner?.full_name ?? null,
          learner_email: learner?.email ?? null,
        })
      ),
    },
    { headers }
  );
}
