import { type NextRequest, NextResponse } from 'next/server';
import {
  getHiveResearchSession,
  updateHiveResearchSession,
} from '@/lib/hive/research-sessions';
import {
  hiveResearchSessionPatchSchema,
  requireHiveAccess,
  withHiveRoute,
} from '../../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
    sessionId: string;
  }>;
};

const ROUTE = '/api/v1/hive/servers/[serverId]/research-sessions/[sessionId]';

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId, sessionId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const session = await getHiveResearchSession({ serverId, sessionId });
    if (!session) {
      return NextResponse.json(
        { error: 'Hive research session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { serverId, sessionId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = hiveResearchSessionPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive research session patch' },
        { status: 400 }
      );
    }

    const session = await updateHiveResearchSession({
      actorUserId: access.access.user.id,
      description: parsed.data.description,
      metadata: parsed.data.metadata,
      name: parsed.data.name,
      serverId,
      sessionId,
      status: parsed.data.status,
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Hive research session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  });
}
