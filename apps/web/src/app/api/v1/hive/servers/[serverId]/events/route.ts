import type { Json } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
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

  const { data, error } = await result.access.sbAdmin.rpc(
    'apply_hive_world_event',
    {
      p_actor_user_id: result.access.user.id,
      p_event_type: parsed.data.eventType,
      p_expected_revision: parsed.data.expectedRevision,
      p_payload: parsed.data.payload as Json,
      p_server_id: serverId,
      p_world_data: parsed.data.world as Json,
    }
  );

  if (error || !data?.[0]) {
    return NextResponse.json(
      {
        error:
          error?.message === 'hive_revision_conflict'
            ? 'Hive world revision conflict'
            : 'Failed to create Hive event',
      },
      { status: error?.message === 'hive_revision_conflict' ? 409 : 400 }
    );
  }

  return NextResponse.json({
    event: mapHiveEvent(data[0]),
    revision: Number(data[0].revision ?? 0),
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => createEvent(request, serverId));
}
