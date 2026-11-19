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
