import { type NextRequest, NextResponse } from 'next/server';
import { HiveAiAccessError } from '@/lib/hive/ai';
import { runHiveNpcInteraction } from '@/lib/hive/npc-interactions';
import {
  hiveNpcRunSchema,
  mapHiveEvent,
  mapHiveNpcRun,
  requireHiveAccess,
  withHiveRoute,
} from '../../../../../_shared';

type RouteContext = {
  params: Promise<{
    npcId: string;
    serverId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { npcId, serverId } = await context.params;

  return withHiveRoute(
    request,
    '/api/v1/hive/servers/[serverId]/npcs/[npcId]/run',
    async () => {
      const access = await requireHiveAccess(request);

      if (!access.ok) {
        return access.response;
      }

      const body = await request.json().catch(() => null);
      const parsed = hiveNpcRunSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid Hive NPC run payload' },
          { status: 400 }
        );
      }

      try {
        const result = await runHiveNpcInteraction({
          actorUserId: access.access.user.id,
          creditSource: parsed.data.creditSource,
          creditWsId: parsed.data.creditWsId,
          expectedRevision: parsed.data.expectedRevision,
          maxTurns: parsed.data.targetNpcId ? (parsed.data.maxTurns ?? 4) : 1,
          model: parsed.data.model,
          prompt: parsed.data.prompt,
          promptMode: parsed.data.promptMode,
          researchSessionId: parsed.data.researchSessionId,
          sbAdmin: access.access.sbAdmin,
          serverId,
          sourceNpcId: npcId,
          targetNpcId: parsed.data.targetNpcId,
          trigger: parsed.data.trigger,
          world: parsed.data.world,
        });
        const firstRun = result.runs[0];

        if (!firstRun) {
          return NextResponse.json(
            { error: 'Failed to persist Hive NPC run' },
            { status: 500 }
          );
        }

        if (!result.event) {
          return NextResponse.json(
            { error: 'Failed to append Hive NPC event' },
            { status: 409 }
          );
        }

        return NextResponse.json({
          event: mapHiveEvent(result.event),
          interactionId: result.interactionId,
          run: mapHiveNpcRun(firstRun),
          runs: result.runs.map(mapHiveNpcRun),
        });
      } catch (error) {
        if (error instanceof HiveAiAccessError) {
          return NextResponse.json(
            { error: error.message },
            { status: error.status }
          );
        }

        console.error('Hive NPC run failed', {
          error: error instanceof Error ? error.message : String(error),
          npcId,
          serverId,
        });
        return NextResponse.json(
          { error: 'Failed to run Hive NPC' },
          { status: 500 }
        );
      }
    }
  );
}
