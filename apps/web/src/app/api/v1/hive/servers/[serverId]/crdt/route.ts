import { type NextRequest, NextResponse } from 'next/server';
import { mergeHiveCrdtUpdate } from '@/lib/hive/crdt';
import {
  fromBase64,
  getHiveSnapshot,
  persistHiveCrdtUpdate,
  toBase64,
} from '@/lib/hive/hive-db';
import {
  hiveCrdtUpdateSchema,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

const ROUTE = '/api/v1/hive/servers/[serverId]/crdt';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

async function getCrdtSnapshot(request: NextRequest, serverId: string) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const { server, state } = await getHiveSnapshot(serverId);

  if (!server || (!server.enabled && !result.access.isAdmin)) {
    return NextResponse.json(
      { error: 'Hive server not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    opSeq: Number(state?.op_seq ?? 0),
    state: toBase64(state?.crdt_state),
    stateVector: toBase64(state?.crdt_state_vector),
    world: state?.world_data ?? { blocks: [], objects: [] },
  });
}

async function postCrdtUpdate(request: NextRequest, serverId: string) {
  const result = await requireHiveAccess(request);
  if (!result.ok) return result.response;

  const body = await request.json().catch(() => null);
  const parsed = hiveCrdtUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Hive CRDT update payload' },
      { status: 400 }
    );
  }

  const { server, state } = await getHiveSnapshot(serverId);

  if (!server || (!server.enabled && !result.access.isAdmin)) {
    return NextResponse.json(
      { error: 'Hive server not found' },
      { status: 404 }
    );
  }

  const update = fromBase64(parsed.data.update);
  const merged = mergeHiveCrdtUpdate({
    currentState: state?.crdt_state,
    fallbackWorld: parsed.data.world ?? null,
    update,
  });
  const opSeq = await persistHiveCrdtUpdate({
    actorUserId: result.access.user.id,
    serverId,
    state: merged.state,
    stateVector: merged.stateVector,
    update,
    world: merged.world,
  });

  return NextResponse.json({
    opSeq,
    stateVector: toBase64(merged.stateVector),
    world: merged.world,
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () =>
    getCrdtSnapshot(request, serverId)
  );
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;
  return withHiveRoute(request, ROUTE, () => postCrdtUpdate(request, serverId));
}
