import type { MindBoardSnapshot, MindEdge, MindNode } from '@tuturuuu/types/db';
import { describe, expect, it } from 'vitest';
import {
  buildHiveMindSimulationPlan,
  buildHiveMindWorkflowDefinition,
  type MaterializedHiveMindAgent,
  type MaterializedHiveMindPair,
} from './mind-simulation-blueprint';

const now = '2026-05-24T00:00:00.000Z';

describe('Hive Mind simulation blueprint', () => {
  it('turns connected Mind nodes into Hive agent drafts and interaction pairs', () => {
    const snapshot = snapshotFixture();
    const plan = buildHiveMindSimulationPlan(snapshot);

    expect(plan.agents.map((agent) => agent.sourceNodeId).sort()).toEqual([
      'goal',
      'plan',
      'system',
    ]);
    expect(plan.pairs).toEqual([
      expect.objectContaining({
        edgeId: 'system-goal',
        sourceNodeId: 'system',
        targetNodeId: 'goal',
      }),
      expect.objectContaining({
        edgeId: 'goal-plan',
        sourceNodeId: 'goal',
        targetNodeId: 'plan',
      }),
    ]);
    const systemAgent = plan.agents.find(
      (agent) => agent.sourceNodeId === 'system'
    );

    expect(systemAgent?.settings).toEqual(
      expect.objectContaining({
        mindSource: expect.objectContaining({
          boardId: 'board-1',
          nodeId: 'system',
        }),
      })
    );
  });

  it('builds a Hive workflow that stamps source context before running pairs', () => {
    const snapshot = snapshotFixture();
    const plan = buildHiveMindSimulationPlan(snapshot);
    const agents: MaterializedHiveMindAgent[] = plan.agents.map((agent) => ({
      ...agent,
      npcId: `npc-${agent.sourceNodeId}`,
    }));
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
      pairs,
      snapshot,
    });

    expect(definition.nodes.map((node) => node.type)).toEqual([
      'manual_trigger',
      'context',
      'world_event',
      'agent_interaction',
      'log',
    ]);
    expect(
      definition.nodes.find((node) => node.id === 'agents')?.data.config
    ).toEqual(
      expect.objectContaining({
        maxTurns: 4,
        pairs: [
          expect.objectContaining({
            sourceNpcId: 'npc-system',
            targetNpcId: 'npc-goal',
          }),
          expect.objectContaining({
            sourceNpcId: 'npc-goal',
            targetNpcId: 'npc-plan',
          }),
        ],
      })
    );
  });
});

function snapshotFixture(): MindBoardSnapshot {
  const nodes = [
    node({
      id: 'system',
      nodeType: 'system',
      positionX: 0,
      title: 'Support desk simulation',
    }),
    node({
      id: 'goal',
      nodeType: 'goal',
      positionX: 320,
      title: 'Resolve escalations',
    }),
    node({
      id: 'plan',
      nodeType: 'plan',
      positionX: 640,
      title: 'Triage workflow',
    }),
  ];

  return {
    board: {
      canvasView: null,
      createdAt: now,
      defaultHorizon: 'month',
      description: null,
      edgeCount: 2,
      id: 'board-1',
      nodeCount: 3,
      settings: {},
      status: 'active',
      tagCount: 0,
      title: 'Customer support workflow',
      updatedAt: now,
      wsId: 'workspace-1',
    },
    edges: [
      edge({ id: 'system-goal', sourceNodeId: 'system', targetNodeId: 'goal' }),
      edge({ id: 'goal-plan', sourceNodeId: 'goal', targetNodeId: 'plan' }),
    ],
    groups: [],
    links: [],
    nodes,
    tags: [],
  };
}

function node(input: Partial<MindNode> & Pick<MindNode, 'id' | 'title'>) {
  return {
    body: 'Coordinate with adjacent agents before acting.',
    color: null,
    createdAt: now,
    height: 120,
    horizon: 'month',
    metadata: {},
    nodeType: 'idea',
    parentNodeId: null,
    positionX: 0,
    positionY: 0,
    status: 'planned',
    updatedAt: now,
    width: 240,
    ...input,
  } satisfies MindNode;
}

function edge(
  input: Partial<MindEdge> &
    Pick<MindEdge, 'id' | 'sourceNodeId' | 'targetNodeId'>
) {
  return {
    color: null,
    createdAt: now,
    edgeType: 'sequence',
    label: null,
    metadata: {},
    updatedAt: now,
    weight: 1,
    ...input,
  } satisfies MindEdge;
}
