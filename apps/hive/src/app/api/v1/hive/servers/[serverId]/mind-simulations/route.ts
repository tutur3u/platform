import { getMindBoardGraphSnapshot } from '@tuturuuu/mind-core';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildHiveMindSimulationPlan,
  buildHiveMindWorkflowDefinition,
  type MaterializedHiveMindAgent,
  type MaterializedHiveMindPair,
} from '@/lib/hive/mind-simulation-blueprint';
import { createHiveNpc } from '@/lib/hive/npcs';
import type { HiveNpcRow } from '@/lib/hive/types';
import {
  createHiveWorkflow,
  validateHiveWorkflowForPersistence,
} from '@/lib/hive/workflows';
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

      const agents: MaterializedHiveMindAgent[] = [];
      const npcRows: HiveNpcRow[] = [];

      for (const draft of plan.agents) {
        const npc = await createHiveNpc({
          createdBy: access.access.user.id,
          npc: {
            backstory: draft.backstory,
            backstoryEnabled: true,
            customPromptEnabled: draft.customPromptEnabled,
            memoryEnabled: draft.memoryEnabled,
            model: draft.model,
            name: draft.name,
            position: draft.position,
            role: draft.role,
            settings: draft.settings,
            systemPrompt: draft.systemPrompt,
          },
          serverId,
        });

        if (npc) {
          agents.push({ ...draft, npcId: npc.id });
          npcRows.push(npc);
        }
      }

      if (agents.length < 2) {
        return NextResponse.json(
          { error: 'Failed to create enough Hive agents' },
          { status: 400 }
        );
      }

      const agentByNodeId = new Map(
        agents.map((agent) => [agent.sourceNodeId, agent])
      );
      const pairs: MaterializedHiveMindPair[] = plan.pairs.flatMap((pair) => {
        const source = agentByNodeId.get(pair.sourceNodeId);
        const target = agentByNodeId.get(pair.targetNodeId);
        if (!source || !target) return [];
        return [
          {
            ...pair,
            sourceNpcId: source.npcId,
            targetNpcId: target.npcId,
          },
        ];
      });
      const definition = buildHiveMindWorkflowDefinition({
        agents,
        maxPairs: parsed.data.maxPairs,
        pairs,
        snapshot,
      });
      const validation = validateHiveWorkflowForPersistence(definition);

      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.errors.join(' ') },
          { status: 400 }
        );
      }

      const workflow = await createHiveWorkflow({
        actorUserId: access.access.user.id,
        definition,
        description: `Imported from Mind board "${snapshot.board.title}" with ${agents.length} agents and ${pairs.length} interaction pairs.`,
        enabled: true,
        name: `Mind: ${snapshot.board.title}`.slice(0, 120),
        serverId,
      });

      if (!workflow) {
        return NextResponse.json(
          { error: 'Failed to create Hive workflow' },
          { status: 400 }
        );
      }

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
