import { type NextRequest, NextResponse } from 'next/server';
import {
  createHiveResearchSession,
  listHiveResearchSessions,
} from '@/lib/hive/research-sessions';
import {
  hiveResearchSessionPayloadSchema,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

const ROUTE = '/api/v1/hive/servers/[serverId]/research-sessions';

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const sessions = await listHiveResearchSessions({ serverId });
    return NextResponse.json({
      activeSession:
        sessions.find((session) => session.status === 'running') ?? null,
      sessions,
    });
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAccess(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = hiveResearchSessionPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive research session payload' },
        { status: 400 }
      );
    }

    const session = await createHiveResearchSession({
      actorUserId: access.access.user.id,
      description: parsed.data.description,
      metadata: parsed.data.metadata,
      name: parsed.data.name,
      serverId,
      status: parsed.data.status,
    });

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create Hive research session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ session }, { status: 201 });
  });
}
