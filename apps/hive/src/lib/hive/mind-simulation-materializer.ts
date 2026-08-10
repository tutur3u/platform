import type { MindBoardSnapshot } from '@tuturuuu/types/db';
import { getHiveSql } from './hive-db';
import {
  buildHiveMindWorkflowDefinition,
  type HiveMindSimulationPlan,
  type MaterializedHiveMindAgent,
  type MaterializedHiveMindPair,
} from './mind-simulation-blueprint';
import { insertHiveNpcBundle } from './npcs';
import type { HiveNpcRow } from './types';
import { ensureHiveWorkflowSchema, insertHiveWorkflow } from './workflow-store';
import { validateHiveWorkflowForPersistence } from './workflows';

export class HiveMindMaterializationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HiveMindMaterializationValidationError';
  }
}

export async function materializeHiveMindSimulation(input: {
  actorUserId: string;
  maxPairs?: number;
  plan: HiveMindSimulationPlan;
  serverId: string;
  snapshot: MindBoardSnapshot;
}) {
  await ensureHiveWorkflowSchema();
  const sql = getHiveSql();

  return sql.begin(async (tx) => {
    const agents: MaterializedHiveMindAgent[] = [];
    const npcRows: HiveNpcRow[] = [];

    for (const draft of input.plan.agents) {
      const npc = await insertHiveNpcBundle(tx, {
        createdBy: input.actorUserId,
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
        serverId: input.serverId,
      });

      if (!npc) {
        throw new Error('Failed to insert Hive NPC bundle');
      }

      agents.push({ ...draft, npcId: npc.id });
      npcRows.push(npc);
    }

    if (agents.length < 2) {
      throw new HiveMindMaterializationValidationError(
        'Failed to create enough Hive agents'
      );
    }

    const agentByNodeId = new Map(
      agents.map((agent) => [agent.sourceNodeId, agent])
    );
    const pairs: MaterializedHiveMindPair[] = input.plan.pairs.flatMap(
      (pair) => {
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
      }
    );
    const definition = buildHiveMindWorkflowDefinition({
      agents,
      maxPairs: input.maxPairs,
      pairs,
      snapshot: input.snapshot,
    });
    const validation = validateHiveWorkflowForPersistence(definition);

    if (!validation.ok) {
      throw new HiveMindMaterializationValidationError(
        validation.errors.join(' ')
      );
    }

    const workflow = await insertHiveWorkflow(tx, {
      actorUserId: input.actorUserId,
      definition,
      description: `Imported from Mind board "${input.snapshot.board.title}" with ${agents.length} agents and ${pairs.length} interaction pairs.`,
      enabled: true,
      name: `Mind: ${input.snapshot.board.title}`.slice(0, 120),
      serverId: input.serverId,
    });

    if (!workflow) {
      throw new Error('Failed to insert Hive workflow');
    }

    return { agents, npcRows, pairs, workflow };
  });
}
