import type { Json } from '@tuturuuu/types/db';
import { type NextRequest, NextResponse } from 'next/server';
import {
  hiveEventSchema,
  mapHiveEvent,
  requireHiveAccess,
  serverLogger,
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
    if (error) {
      serverLogger.warn('Failed to create Hive world event', {
        code: error.code,
        details: error.details,
        eventType: parsed.data.eventType,
        message: error.message,
        serverId,
      });
    }

    const isRevisionConflict =
      error?.message === 'hive_revision_conflict' || error?.code === '40001';
    const isAccessDenied =
      error?.message === 'hive_access_denied' || error?.code === '42501';
    const isMissingServer =
      error?.message === 'hive_server_not_found' || error?.code === 'P0002';

    return NextResponse.json(
      {
        code: isRevisionConflict
          ? 'hive_revision_conflict'
          : isAccessDenied
            ? 'hive_access_denied'
            : isMissingServer
              ? 'hive_server_not_found'
              : 'hive_event_failed',
        error: isRevisionConflict
          ? 'Hive world revision conflict'
          : isAccessDenied
            ? 'Hive access denied'
            : isMissingServer
              ? 'Hive server not found'
              : 'Failed to create Hive event',
      },
      {
        status: isRevisionConflict
          ? 409
          : isAccessDenied
            ? 403
            : isMissingServer
              ? 404
              : 400,
      }
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
