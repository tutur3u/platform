import { type NextRequest, NextResponse } from 'next/server';
import { createHiveWorldEvent } from '@/lib/hive/hive-db';
import {
  ensureHiveResearchSchema,
  resolveHiveResearchSessionId,
} from '@/lib/hive/research-schema';
import {
  hiveEventSchema,
  mapHiveEvent,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]/events';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

async function createEvent(request: NextRequest, serverId: string) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = hiveEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Hive event payload' },
      { status: 400 }
    );
  }

  await ensureHiveResearchSchema();
  const researchSessionId = await resolveHiveResearchSessionId({
    researchSessionId: parsed.data.researchSessionId,
    serverId,
  });

  const event = await createHiveWorldEvent({
    actorUserId: result.access.user.id,
    eventType: parsed.data.eventType,
    payload: {
      expectedRevision: parsed.data.expectedRevision,
      researchSessionId,
      ...parsed.data.payload,
    },
    researchSessionId,
    serverId,
    world: parsed.data.world,
  });

  if (!event) {
    return NextResponse.json(
      {
        code: 'hive_event_failed',
        error: 'Failed to create Hive event',
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    event: mapHiveEvent(event),
    revision: Number(event.revision ?? event.op_seq ?? 0),
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => createEvent(request, serverId));
}
