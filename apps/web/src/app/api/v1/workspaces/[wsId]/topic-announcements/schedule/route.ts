import { NextResponse } from 'next/server';
import { getWorkspaceSchedulingTimezone } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared';
import { resolveScheduleAccess } from '@/lib/topic-schedule/access';
import { loadScheduleMonth } from '@/lib/topic-schedule/schedule-data';
import { saveScheduleMonth } from '@/lib/topic-schedule/schedule-save';
import {
  ScheduleMonthQuerySchema,
  ScheduleSaveSchema,
} from '@/lib/topic-schedule/schemas';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveScheduleAccess(request, wsId);
  if (access.response) return access.response;

  const parsed = ScheduleMonthQuerySchema.safeParse({
    month: new URL(request.url).searchParams.get('month'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { normalizedWsId, sbAdmin } = access.context;
  const data = await loadScheduleMonth({
    month: parsed.data.month,
    normalizedWsId,
    sbAdmin,
  });
  return NextResponse.json({ data });
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await resolveScheduleAccess(request, wsId);
  if (access.response) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ScheduleSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actorUserId, normalizedWsId, sbAdmin } = access.context;
  const result = await saveScheduleMonth(
    {
      actorUserId,
      normalizedWsId,
      sbAdmin,
      timeZone: await getWorkspaceSchedulingTimezone(sbAdmin, normalizedWsId),
    },
    parsed.data
  );
  if (!result.ok) {
    // 409: some sessions entered delivery mid-save and were left unchanged;
    // the rest of the save went through (`saved`). 400: nothing was written.
    return NextResponse.json(
      result.conflict
        ? {
            message: 'Some sessions changed while saving',
            rowErrors: result.rowErrors,
            saved: result.saved,
          }
        : { message: 'Invalid sessions', rowErrors: result.rowErrors },
      { status: result.conflict ? 409 : 400 }
    );
  }

  const { ok: _ok, ...data } = result;
  return NextResponse.json({ data });
}
