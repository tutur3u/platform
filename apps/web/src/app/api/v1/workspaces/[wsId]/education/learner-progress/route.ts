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

type DirectQuizLink = { module_id: string; quiz_id: string };
type QuizSetLink = { module_id: string; set_id: string };
type QuizSetMembership = { set_id: string; quiz_id: string };

const LINK_PAGE = 1000;
const ID_CHUNK = 100;

function chunkIds(ids: string[]) {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    chunks.push(ids.slice(index, index + ID_CHUNK));
  }
  return chunks;
}

async function eachPage<T>(
  load: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += LINK_PAGE) {
    const result = await load(from, from + LINK_PAGE - 1);
    if (result.error) return null;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < LINK_PAGE) return rows;
  }
}

function quizLinkedModuleIds(input: {
  direct: DirectQuizLink[];
  sets: QuizSetLink[];
  memberships: QuizSetMembership[];
  workspaceQuizIds: Set<string>;
}) {
  const linked = new Set<string>();
  for (const row of input.direct) {
    if (input.workspaceQuizIds.has(row.quiz_id)) linked.add(row.module_id);
  }
  const setsWithWorkspaceQuiz = new Set(
    input.memberships
      .filter((row) => input.workspaceQuizIds.has(row.quiz_id))
      .map((row) => row.set_id)
  );
  for (const row of input.sets) {
    if (setsWithWorkspaceQuiz.has(row.set_id)) linked.add(row.module_id);
  }
  return linked;
}

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
            .not('is_guest', 'is', true)
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

  const courses = (coursesResult.data ?? []) as CourseProgressRow[];
  const moduleIds = [
    ...new Set(
      courses.flatMap((course) =>
        (course.workspace_course_modules ?? []).map(
          (courseModule) => courseModule.id
        )
      )
    ),
  ];
  const directLinks: DirectQuizLink[] = [];
  const setLinks: QuizSetLink[] = [];
  for (const ids of chunkIds(moduleIds)) {
    const [directPage, setPage] = await Promise.all([
      eachPage<DirectQuizLink>((from, to) =>
        sbAdmin
          .from('course_module_quizzes')
          .select('module_id, quiz_id')
          .in('module_id', ids)
          .range(from, to)
      ),
      eachPage<QuizSetLink>((from, to) =>
        sbAdmin
          .from('course_module_quiz_sets')
          .select('module_id, set_id')
          .in('module_id', ids)
          .range(from, to)
      ),
    ]);
    if (!directPage || !setPage) {
      return NextResponse.json(
        { message: 'Failed to load learner progress' },
        { status: 500, headers }
      );
    }
    directLinks.push(...directPage);
    setLinks.push(...setPage);
  }

  const memberships: QuizSetMembership[] = [];
  for (const ids of chunkIds([...new Set(setLinks.map((row) => row.set_id))])) {
    const page = await eachPage<QuizSetMembership>((from, to) =>
      sbAdmin
        .from('quiz_set_quizzes')
        .select('set_id, quiz_id')
        .in('set_id', ids)
        .range(from, to)
    );
    if (!page) {
      return NextResponse.json(
        { message: 'Failed to load learner progress' },
        { status: 500, headers }
      );
    }
    memberships.push(...page);
  }

  const workspaceQuizIds = new Set<string>();
  const quizIds = [
    ...new Set([
      ...directLinks.map((row) => row.quiz_id),
      ...memberships.map((row) => row.quiz_id),
    ]),
  ];
  for (const ids of chunkIds(quizIds)) {
    const page = await eachPage<{ id: string }>((from, to) =>
      sbAdmin
        .from('workspace_quizzes')
        .select('id')
        .in('id', ids)
        .eq('ws_id', wsId)
        .range(from, to)
    );
    if (!page) {
      return NextResponse.json(
        { message: 'Failed to load learner progress' },
        { status: 500, headers }
      );
    }
    for (const row of page) workspaceQuizIds.add(row.id);
  }

  const linkedModuleIds = quizLinkedModuleIds({
    direct: directLinks,
    sets: setLinks,
    memberships,
    workspaceQuizIds,
  });
  const linkedByCourse = new Map<string, Set<string>>();
  for (const course of courses) {
    const linked = new Set<string>();
    for (const courseModule of course.workspace_course_modules ?? []) {
      if (linkedModuleIds.has(courseModule.id)) linked.add(courseModule.id);
    }
    linkedByCourse.set(course.id, linked);
  }

  const completedByCourse = new Map<string, Set<string>>();
  for (const row of progressResult.data ?? []) {
    const linked = linkedByCourse.get(row.course_id);
    if (!linked?.has(row.module_id)) continue;
    const completed = completedByCourse.get(row.course_id) ?? new Set<string>();
    completed.add(row.module_id);
    completedByCourse.set(row.course_id, completed);
  }

  const learner = learnerResult.data;
  const courseProgress = courses.map((course) => {
    const total = linkedByCourse.get(course.id)?.size ?? 0;
    const completed = Math.min(
      completedByCourse.get(course.id)?.size ?? 0,
      total
    );
    return {
      course_id: course.id,
      completed_modules: completed,
      total_modules: total,
      completion_ratio: total === 0 ? 0 : completed / total,
    };
  });

  return NextResponse.json(
    {
      courses: courseProgress,
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
