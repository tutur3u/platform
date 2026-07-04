import { type NextRequest, NextResponse } from 'next/server';
import { HiveAiAccessError } from '@/lib/hive/ai';
import { runHiveNpcInteraction } from '@/lib/hive/npc-interactions';
import { appendHiveResearchSessionEvent } from '@/lib/hive/research-schema';
import { getHiveResearchSession } from '@/lib/hive/research-sessions';
import {
  hivePairQueueRunSchema,
  mapHiveEvent,
  mapHiveNpcRun,
  requireHiveAccess,
  withHiveRoute,
} from '../../../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
    sessionId: string;
  }>;
};

const ROUTE =
  '/api/v1/hive/servers/[serverId]/research-sessions/[sessionId]/run-pair-queue';

export async function POST(request: NextRequest, { params }: Params) {
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

    const body = await request.json().catch(() => null);
    const parsed = hivePairQueueRunSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Hive pair queue payload' },
        { status: 400 }
      );
    }

    const pairs = parsed.data.pairs.slice(0, parsed.data.maxPairs);
    await appendHiveResearchSessionEvent({
      actorUserId: access.access.user.id,
      eventKind: 'pair_queue.started',
      payload: {
        maxTurns: parsed.data.maxTurns,
        pairCount: pairs.length,
        prompt: parsed.data.prompt ?? null,
      },
      serverId,
      sessionId,
      sourceType: 'pair_queue',
    });

    const results = [];

    for (const [index, pair] of pairs.entries()) {
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
          researchSessionId: sessionId,
          sbAdmin: access.access.sbAdmin,
          serverId,
          sourceNpcId: pair.sourceNpcId,
          targetNpcId: pair.targetNpcId,
          trigger: 'manual',
          world: parsed.data.world,
        });

        results.push({
          event: result.event ? mapHiveEvent(result.event) : null,
          index,
          interactionId: result.interactionId,
          ok: true,
          pair,
          runs: result.runs.map(mapHiveNpcRun),
        });
      } catch (error) {
        const message =
          error instanceof HiveAiAccessError || error instanceof Error
            ? error.message
            : 'Failed to run Hive pair interaction';

        console.warn('Hive pair queue interaction failed', {
          error: message,
          index,
          serverId,
          sessionId,
          sourceNpcId: pair.sourceNpcId,
          targetNpcId: pair.targetNpcId,
        });
        results.push({
          error: message,
          index,
          ok: false,
          pair,
          runs: [],
        });
      }
    }

    const completed = results.filter((result) => result.ok).length;
    await appendHiveResearchSessionEvent({
      actorUserId: access.access.user.id,
      eventKind: 'pair_queue.completed',
      payload: {
        completed,
        failed: results.length - completed,
        pairCount: results.length,
      },
      serverId,
      sessionId,
      sourceType: 'pair_queue',
    });

    return NextResponse.json({
      results,
      summary: {
        completed,
        failed: results.length - completed,
        total: results.length,
      },
    });
  });
}
