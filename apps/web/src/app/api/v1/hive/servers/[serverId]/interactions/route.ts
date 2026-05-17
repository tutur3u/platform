import { type NextRequest, NextResponse } from 'next/server';
import { HiveAiAccessError } from '@/lib/hive/ai';
import { runHiveNpcInteraction } from '@/lib/hive/npc-interactions';
import {
  hiveNpcInteractionSchema,
  mapHiveEvent,
  mapHiveNpcRun,
  requireHiveAccess,
  serverLogger,
  withHiveRoute,
} from '../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(
    request,
    '/api/v1/hive/servers/[serverId]/interactions',
    async () => {
      const access = await requireHiveAccess(request);
      if (!access.ok) return access.response;

      const body = await request.json().catch(() => null);
      const parsed = hiveNpcInteractionSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid Hive interaction payload' },
          { status: 400 }
        );
      }

      try {
        const result = await runHiveNpcInteraction({
          actorUserId: access.access.user.id,
          creditSource: parsed.data.creditSource,
          creditWsId: parsed.data.creditWsId,
          expectedRevision: parsed.data.expectedRevision,
          maxTurns: parsed.data.maxTurns,
          model: parsed.data.model,
          prompt: parsed.data.prompt,
          promptMode: 'enhanced',
          sbAdmin: access.access.sbAdmin,
          serverId,
          sourceNpcId: parsed.data.sourceNpcId,
          targetNpcId: parsed.data.targetNpcId,
          trigger: parsed.data.trigger,
          world: parsed.data.world,
        });

        if (!result.event) {
          return NextResponse.json(
            { error: 'Failed to append Hive NPC interaction event' },
            { status: 409 }
          );
        }

        return NextResponse.json({
          event: mapHiveEvent(result.event),
          interactionId: result.interactionId,
          runs: result.runs.map(mapHiveNpcRun),
        });
      } catch (error) {
        if (error instanceof HiveAiAccessError) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }

        serverLogger.error('Hive NPC interaction failed', {
          error: error instanceof Error ? error.message : String(error),
          serverId,
        });
        return NextResponse.json(
          { error: 'Failed to run Hive interaction' },
          { status: 500 }
        );
      }
    }
  );
}
