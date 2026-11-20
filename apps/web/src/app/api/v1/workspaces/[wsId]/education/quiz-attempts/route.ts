import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLearnerWorkspace } from '@/lib/education/learner-access';
import { learnerProgressRoutesEnabled } from '@/lib/education/learner-progress-flag';

const bodySchema = z.object({
  course_id: z.uuid(),
  idempotency_key: z.string().trim().min(1).max(200),
  duration_seconds: z.number().int().min(0).max(86_400).optional(),
  answers: z
    .array(
      z.object({
        quiz_id: z.uuid(),
        selected_option_id: z.uuid(),
      })
    )
    .min(1)
    .max(100),
});

const practiceQuizSchema = z.object({
  id: z.string(),
  question: z.string(),
  quiz_options: z.array(z.object({ id: z.string(), value: z.string() })),
});

const practiceQuizLink = z.object({ quiz: practiceQuizSchema.nullable() });
const coursePracticeSchema = z.object({
  modules: z.array(
    z.object({
      direct: z.array(practiceQuizLink),
      sets: z.array(
        z.object({
          set: z.object({ items: z.array(practiceQuizLink) }).nullable(),
        })
      ),
    })
  ),
});

type AttemptRpcClient = {
  schema(schema: 'private'): {
    rpc(
      fn: string,
      args: Record<string, unknown>
    ): Promise<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>;
  };
};

function attemptErrorStatus(code: string | undefined) {
  if (code === 'P4290') return 429;
  if (code === '42501') return 403;
  if (code === '22023' || code === '23514' || code === '22P02') return 400;
  return 500;
}

function attemptErrorMessage(status: number) {
  if (status === 429) return 'Too many attempts';
  if (status === 403) return 'Not enrolled in this course';
  if (status === 400) return 'Invalid attempt';
  return 'Failed to save attempt';
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
  const courseId = z
    .uuid()
    .safeParse(request.nextUrl.searchParams.get('courseId'));
  if (!courseId.success) {
    return NextResponse.json(
      { message: 'Invalid course' },
      { status: 400, headers }
    );
  }

  const failed = () =>
    NextResponse.json(
      { message: 'Failed to load course practice' },
      { status: 500, headers }
    );
  const forbidden = () =>
    NextResponse.json(
      { message: 'Not enrolled in this course' },
      { status: 403, headers }
    );
  const linked = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('ws_id', wsId)
    .eq('platform_user_id', userId)
    .maybeSingle();
  if (linked.error) return failed();
  if (!linked.data) return forbidden();

  const enrolled = await sbAdmin
    .from('workspace_user_groups_users')
    .select('group_id')
    .eq('group_id', courseId.data)
    .eq('user_id', linked.data.virtual_user_id)
    .maybeSingle();
  if (enrolled.error) return failed();
  if (!enrolled.data) return forbidden();

  const quizColumns = 'id, question, quiz_options(id, value)';
  const course = await sbAdmin
    .from('workspace_user_groups')
    .select(`id, modules:workspace_course_modules(
      direct:course_module_quizzes(quiz:workspace_quizzes(${quizColumns})),
      sets:course_module_quiz_sets(set:workspace_quiz_sets(
        items:quiz_set_quizzes(quiz:workspace_quizzes(${quizColumns}))
      ))
    )`)
    .eq('id', courseId.data)
    .eq('ws_id', wsId)
    .eq('archived', false)
    .not('is_guest', 'is', true)
    .eq('is_course_published', true)
    .eq('modules.is_published', true)
    .eq('modules.direct.quiz.ws_id', wsId)
    .eq('modules.direct.quiz.type', 'multiple_choice')
    .eq('modules.sets.set.ws_id', wsId)
    .eq('modules.sets.set.items.quiz.ws_id', wsId)
    .eq('modules.sets.set.items.quiz.type', 'multiple_choice')
    .order('sort_key', { referencedTable: 'modules', ascending: true })
    .order('id', { referencedTable: 'modules', ascending: true })
    .limit(20, { referencedTable: 'modules' })
    .limit(20, { referencedTable: 'modules.direct' })
    .limit(20, { referencedTable: 'modules.sets' })
    .limit(20, { referencedTable: 'modules.sets.set.items' })
    .maybeSingle();
  if (course.error) return failed();
  if (!course.data) return forbidden();

  const parsedCourse = coursePracticeSchema.safeParse(course.data);
  if (!parsedCourse.success) return failed();

  const candidates = parsedCourse.data.modules.flatMap((module) => [
    ...module.direct.map(({ quiz }) => quiz),
    ...module.sets.flatMap(
      ({ set }) => set?.items.map(({ quiz }) => quiz) ?? []
    ),
  ]);
  const quizzes = new Map<string, z.infer<typeof practiceQuizSchema>>();
  for (const quiz of candidates) {
    if (quiz && quiz.quiz_options.length >= 2) quizzes.set(quiz.id, quiz);
  }
  return NextResponse.json(
    { data: [...quizzes.values()].slice(0, 20) },
    { headers }
  );
}

// Practice module quizzes only. The saved attempt includes is_correct per
// answer so the learner can review practice. Graded course tests stay on the
// Tulearn test attempt APIs, which withhold that key until the score is published.
export async function POST(
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

  const parsed = bodySchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid attempt' },
      { status: 400, headers }
    );
  }

  const client = sbAdmin as unknown as AttemptRpcClient;
  const submitted = await client
    .schema('private')
    .rpc('submit_education_learner_attempt', {
      p_ws_id: wsId,
      p_user_id: userId,
      p_course_id: parsed.data.course_id,
      p_idempotency_key: parsed.data.idempotency_key,
      p_duration_seconds: parsed.data.duration_seconds ?? null,
      p_answers: parsed.data.answers,
    });
  if (submitted.error) {
    const status = attemptErrorStatus(submitted.error.code);
    return NextResponse.json(
      { message: attemptErrorMessage(status) },
      { status, headers }
    );
  }

  const payload = submitted.data as {
    replayed?: boolean;
    attempt?: unknown;
    completed_module_ids?: unknown;
  } | null;
  return NextResponse.json(
    {
      attempt: payload?.attempt ?? null,
      completed_module_ids: payload?.completed_module_ids ?? [],
    },
    { status: payload?.replayed ? 200 : 201, headers }
  );
}
