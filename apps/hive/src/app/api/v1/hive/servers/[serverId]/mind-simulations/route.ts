import { getMindBoardGraphSnapshot } from '@tuturuuu/mind-core';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildHiveMindSimulationPlan } from '@/lib/hive/mind-simulation-blueprint';
import {
  HiveMindMaterializationValidationError,
  materializeHiveMindSimulation,
} from '@/lib/hive/mind-simulation-materializer';
import { mapHiveNpc, requireHiveAdmin, withHiveRoute } from '../../../_shared';

type Params = {
  params: Promise<{ serverId: string }>;
};

const ROUTE = '/api/v1/hive/servers/[serverId]/mind-simulations';

const mindSimulationSchema = z.object({
  boardId: z.guid(),
  maxAgents: z.number().int().min(2).max(12).optional(),
  maxPairs: z.number().int().min(1).max(24).optional(),
  workspaceId: z.string().trim().min(1),
});

export async function POST(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(request, ROUTE, async () => {
    const access = await requireHiveAdmin(request);
    if (!access.ok) return access.response;

    const body = await request.json().catch(() => null);
    const parsed = mindSimulationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid Mind simulation payload' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    let normalizedWsId: string;

    try {
      normalizedWsId = await normalizeWorkspaceId(
        parsed.data.workspaceId,
        supabase,
        request
      );
    } catch {
      return NextResponse.json(
        { error: 'Invalid workspace identifier' },
        { status: 422 }
      );
    }

    const membership = await verifyWorkspaceMembershipType({
      requiredType: 'MEMBER',
      supabase,
      userId: access.access.user.id,
      wsId: normalizedWsId,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Internal error verifying workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    try {
      const snapshot = await getMindBoardGraphSnapshot(
        normalizedWsId,
        parsed.data.boardId
      );

      if (!snapshot) {
        return NextResponse.json(
          { error: 'Mind board not found' },
          { status: 404 }
        );
      }

      const plan = buildHiveMindSimulationPlan(snapshot, {
        maxAgents: parsed.data.maxAgents,
        maxPairs: parsed.data.maxPairs,
      });

      if (plan.agents.length < 2 || plan.pairs.length === 0) {
        return NextResponse.json(
          {
            error:
              'Mind board needs at least two importable nodes to create a Hive simulation',
          },
          { status: 400 }
        );
      }

      const { agents, npcRows, pairs, workflow } =
        await materializeHiveMindSimulation({
          actorUserId: access.access.user.id,
          maxPairs: parsed.data.maxPairs,
          plan,
          serverId,
          snapshot,
        });

      return NextResponse.json(
        {
          mindBoard: {
            edgeCount: snapshot.edges.length,
            id: snapshot.board.id,
            nodeCount: snapshot.nodes.length,
            title: snapshot.board.title,
          },
          npcs: npcRows.map(mapHiveNpc),
          summary: {
            agents: agents.length,
            pairs: pairs.length,
          },
          workflow,
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof HiveMindMaterializationValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      console.error('Failed to create Hive simulation from Mind board', {
        boardId: parsed.data.boardId,
        error: error instanceof Error ? error.message : String(error),
        serverId,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { error: 'Failed to create Hive simulation from Mind board' },
        { status: 500 }
      );
    }
  });
}
