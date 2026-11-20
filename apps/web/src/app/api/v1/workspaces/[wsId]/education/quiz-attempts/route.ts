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

const practiceLinksSchema = z.array(
  z.object({
    module_id: z.string(),
    quiz_id: z.string(),
    quiz_position: z.number().int(),
  })
);

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

  const course = await sbAdmin
    .from('workspace_user_groups')
    .select('id')
    .eq('id', courseId.data)
    .eq('ws_id', wsId)
    .eq('archived', false)
    .not('is_guest', 'is', true)
    .eq('is_course_published', true)
    .maybeSingle();
  if (course.error) return failed();
  if (!course.data) return forbidden();

  // The submit RPC accepts exactly this list: published modules,
  // multiple-choice quizzes with two or more options, at most 20.
  const practice = await (sbAdmin as unknown as AttemptRpcClient)
    .schema('private')
    .rpc('education_learner_practice_quizzes', {
      p_ws_id: wsId,
      p_course_id: courseId.data,
    });
  if (practice.error) return failed();
  const links = practiceLinksSchema.safeParse(practice.data ?? []);
  if (!links.success) return failed();

  const positions = new Map<string, number>();
  for (const link of links.data) {
    const current = positions.get(link.quiz_id);
    if (current === undefined || link.quiz_position < current) {
      positions.set(link.quiz_id, link.quiz_position);
    }
  }
  if (positions.size === 0) {
    return NextResponse.json({ data: [] }, { headers });
  }

  const quizzes = await sbAdmin
    .from('workspace_quizzes')
    .select('id, question, quiz_options(id, value)')
    .eq('ws_id', wsId)
    .in('id', [...positions.keys()]);
  if (quizzes.error) return failed();
  const parsedQuizzes = z.array(practiceQuizSchema).safeParse(quizzes.data);
  if (!parsedQuizzes.success) return failed();

  const position = (id: string) => positions.get(id) ?? Number.MAX_SAFE_INTEGER;
  const served = parsedQuizzes.data
    .filter((quiz) => quiz.quiz_options.length >= 2)
    .sort((left, right) => position(left.id) - position(right.id))
    .slice(0, 20);
  return NextResponse.json({ data: served }, { headers });
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
