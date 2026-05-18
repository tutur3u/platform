import { type NextRequest, NextResponse } from 'next/server';
import { listHiveResearchTimeline } from '@/lib/hive/research-sessions';
import { requireHiveAccess, withHiveRoute } from '../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

function nullableParam(request: NextRequest, key: string) {
  const value = request.nextUrl.searchParams.get(key)?.trim();
  return value || null;
}

function limitParam(request: NextRequest) {
  const value = Number(request.nextUrl.searchParams.get('limit') ?? 180);
  return Number.isFinite(value) ? value : 180;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(
    request,
    '/api/v1/hive/servers/[serverId]/timeline',
    async () => {
      const access = await requireHiveAccess(request);
      if (!access.ok) return access.response;

      const timeline = await listHiveResearchTimeline({
        filters: {
          actorUserId: nullableParam(request, 'actorUserId'),
          eventType: nullableParam(request, 'eventType'),
          limit: limitParam(request),
          npcId: nullableParam(request, 'npcId'),
          researchSessionId: nullableParam(request, 'researchSessionId'),
          status: nullableParam(request, 'status'),
          trigger: nullableParam(request, 'trigger'),
          workflowId: nullableParam(request, 'workflowId'),
        },
        serverId,
      });

      return NextResponse.json(timeline);
    }
  );
}
