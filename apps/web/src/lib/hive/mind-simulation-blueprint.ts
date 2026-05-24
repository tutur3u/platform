import type { MindBoardSnapshot, MindEdge, MindNode } from '@tuturuuu/types/db';
import type { HiveWorkflowDefinition } from './workflow-types';

const DEFAULT_AGENT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_MAX_AGENTS = 12;
const DEFAULT_MAX_PAIRS = 24;
const MAX_TEXT_LENGTH = 1400;

type MindAgentSource = Pick<
  MindNode,
  | 'body'
  | 'horizon'
  | 'id'
  | 'metadata'
  | 'nodeType'
  | 'positionX'
  | 'positionY'
  | 'status'
  | 'title'
>;

export type HiveMindAgentDraft = {
  backstory: string;
  customPromptEnabled: boolean;
  memoryEnabled: boolean;
  model: string;
  name: string;
  position: { x: number; y: number; z: number };
  role: string;
  settings: Record<string, unknown>;
  sourceNodeId: string;
  systemPrompt: string;
};

export type HiveMindPairDraft = {
  edgeId?: string;
  edgeType?: MindEdge['edgeType'];
  label?: string | null;
  sourceNodeId: string;
  targetNodeId: string;
};

export type HiveMindSimulationPlan = {
  agents: HiveMindAgentDraft[];
  pairs: HiveMindPairDraft[];
};

export type MaterializedHiveMindAgent = HiveMindAgentDraft & {
  npcId: string;
};

export type MaterializedHiveMindPair = HiveMindPairDraft & {
  sourceNpcId: string;
  targetNpcId: string;
};

export function buildHiveMindSimulationPlan(
  snapshot: MindBoardSnapshot,
  options: { maxAgents?: number; maxPairs?: number } = {}
): HiveMindSimulationPlan {
  const maxAgents = clampInteger(options.maxAgents, 2, DEFAULT_MAX_AGENTS);
  const selectedNodes = selectAgentNodes(snapshot, maxAgents);
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
  const agents = selectedNodes.map((node, index) =>
    toAgentDraft({
      boardId: snapshot.board.id,
      boardTitle: snapshot.board.title,
      index,
      node,
      nodes: selectedNodes,
    })
  );
  const pairs = buildPairDrafts({
    edges: snapshot.edges,
    maxPairs: clampInteger(options.maxPairs, 1, DEFAULT_MAX_PAIRS),
    nodes: selectedNodes,
    selectedNodeIds,
  });

  return { agents, pairs };
}

export function buildHiveMindWorkflowDefinition(input: {
  agents: MaterializedHiveMindAgent[];
  maxPairs?: number;
  pairs: MaterializedHiveMindPair[];
  snapshot: MindBoardSnapshot;
}): HiveWorkflowDefinition {
  const { agents, snapshot } = input;
  const boardTitle = snapshot.board.title.trim() || 'Mind board';
  const maxPairs = clampInteger(
    input.maxPairs ?? input.pairs.length,
    1,
    DEFAULT_MAX_PAIRS
  );
  const pairs = input.pairs.slice(0, maxPairs);
  const boardMarkerId = `mind:${snapshot.board.id.slice(0, 8)}:marker`;

  return {
    edges: [
      { id: 'trigger-context', source: 'trigger', target: 'context' },
      { id: 'context-import', source: 'context', target: 'import-board' },
      { id: 'import-board-agents', source: 'import-board', target: 'agents' },
      { id: 'agents-log', source: 'agents', target: 'log' },
    ],
    nodes: [
      {
        data: { label: 'Manual trigger' },
        id: 'trigger',
        position: { x: 0, y: 120 },
        type: 'manual_trigger',
      },
      {
        data: { label: 'Read Hive world' },
        id: 'context',
        position: { x: 250, y: 120 },
        type: 'context',
      },
      {
        data: {
          config: {
            eventType: 'mind.simulation.imported',
            payload: {
              agentCount: agents.length,
              boardId: snapshot.board.id,
              boardTitle,
              edgeCount: snapshot.edges.length,
              nodeCount: snapshot.nodes.length,
              pairCount: pairs.length,
              source: 'mind',
            },
            worldPatch: {
              objects: [
                {
                  id: boardMarkerId,
                  position: { x: 0, y: 1, z: 0 },
                  state: {
                    agentCount: agents.length,
                    boardId: snapshot.board.id,
                    boardTitle,
                    pairCount: pairs.length,
                  },
                  type: 'mind-board-marker',
                },
              ],
            },
          },
          label: 'Stamp Mind context',
        },
        id: 'import-board',
        position: { x: 520, y: 120 },
        type: 'world_event',
      },
      {
        data: {
          config: {
            maxPairs,
            maxTurns: 4,
            pairs: pairs.map((pair) => ({
              edgeId: pair.edgeId ?? null,
              edgeType: pair.edgeType ?? null,
              label: pair.label ?? null,
              sourceNpcId: pair.sourceNpcId,
              targetNpcId: pair.targetNpcId,
            })),
            prompt: [
              `Simulate the Mind board "${boardTitle}" as a group of AI agents.`,
              'Each agent represents one source node and should stay grounded in the board relationships.',
              'Have agents debate dependencies, risks, decisions, and next workflow steps for the live Hive world.',
            ].join(' '),
          },
          label: 'Run agent interactions',
        },
        id: 'agents',
        position: { x: 790, y: 120 },
        type: 'agent_interaction',
      },
      {
        data: {
          config: {
            message:
              'Mind simulation completed {{steps.agents.output.summary.completed}} of {{steps.agents.output.summary.total}} agent pairs.',
          },
          label: 'Summarize run',
        },
        id: 'log',
        position: { x: 1060, y: 120 },
        type: 'log',
      },
    ],
    version: 1,
  };
}

function selectAgentNodes(snapshot: MindBoardSnapshot, maxAgents: number) {
  const degree = new Map<string, number>();
  for (const edge of snapshot.edges) {
    degree.set(edge.sourceNodeId, (degree.get(edge.sourceNodeId) ?? 0) + 1);
    degree.set(edge.targetNodeId, (degree.get(edge.targetNodeId) ?? 0) + 1);
  }

  return [...snapshot.nodes]
    .sort((a, b) => {
      const scoreDelta = scoreAgentNode(b, degree) - scoreAgentNode(a, degree);
      if (scoreDelta !== 0) return scoreDelta;
      if (a.positionY !== b.positionY) return a.positionY - b.positionY;
      if (a.positionX !== b.positionX) return a.positionX - b.positionX;
      return a.title.localeCompare(b.title);
    })
    .slice(0, maxAgents);
}

function scoreAgentNode(node: MindNode, degree: Map<string, number>) {
  const typeScore: Record<MindNode['nodeType'], number> = {
    decision: 8,
    goal: 10,
    idea: 5,
    milestone: 7,
    plan: 9,
    question: 4,
    resource: 3,
    risk: 6,
    system: 10,
  };
  const statusScore = node.status === 'cancelled' ? -4 : 0;
  return (
    typeScore[node.nodeType] + (degree.get(node.id) ?? 0) * 2 + statusScore
  );
}

function toAgentDraft(input: {
  boardId: string;
  boardTitle: string;
  index: number;
  node: MindAgentSource;
  nodes: MindAgentSource[];
}): HiveMindAgentDraft {
  const tags = getNodeTags(input.node);
  const boardTitle = input.boardTitle.trim() || 'Mind board';
  const nodeTitle = input.node.title.trim() || `Mind agent ${input.index + 1}`;
  const body = input.node.body?.trim();

  return {
    backstory: truncateText(
      [
        `Source board: ${boardTitle}.`,
        `Source node: ${nodeTitle}.`,
        `Type: ${input.node.nodeType}. Status: ${input.node.status}. Horizon: ${input.node.horizon}.`,
        tags.length ? `Tags: ${tags.join(', ')}.` : null,
        body ? `Node context: ${body}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      MAX_TEXT_LENGTH
    ),
    customPromptEnabled: true,
    memoryEnabled: true,
    model: DEFAULT_AGENT_MODEL,
    name: truncateText(nodeTitle, 96),
    position: normalizeMindPosition(input.node, input.nodes),
    role: `${input.node.nodeType.replaceAll('_', ' ')} agent`,
    settings: {
      mindSource: {
        boardId: input.boardId,
        boardTitle,
        horizon: input.node.horizon,
        nodeId: input.node.id,
        nodeType: input.node.nodeType,
        status: input.node.status,
        tags,
      },
    },
    sourceNodeId: input.node.id,
    systemPrompt: truncateText(
      [
        'You are an AI agent spawned from a Tuturuuu Mind board node.',
        `Represent the perspective, constraints, and goals of "${nodeTitle}".`,
        'When interacting in Hive, reason with other agents from the graph, expose tradeoffs, and propose inspectable next actions.',
      ].join(' '),
      MAX_TEXT_LENGTH
    ),
  };
}

function buildPairDrafts(input: {
  edges: MindEdge[];
  maxPairs: number;
  nodes: MindAgentSource[];
  selectedNodeIds: Set<string>;
}) {
  const pairs: HiveMindPairDraft[] = [];
  const seen = new Set<string>();

  for (const edge of input.edges) {
    if (
      !input.selectedNodeIds.has(edge.sourceNodeId) ||
      !input.selectedNodeIds.has(edge.targetNodeId)
    ) {
      continue;
    }

    const key = `${edge.sourceNodeId}:${edge.targetNodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({
      edgeId: edge.id,
      edgeType: edge.edgeType,
      label: edge.label,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
    });
    if (pairs.length >= input.maxPairs) return pairs;
  }

  if (pairs.length > 0 || input.nodes.length < 2) return pairs;

  for (let index = 0; index < input.nodes.length; index += 1) {
    const source = input.nodes[index];
    const target = input.nodes[(index + 1) % input.nodes.length];
    if (!source || !target || source.id === target.id) continue;

    pairs.push({
      label: 'round-robin',
      sourceNodeId: source.id,
      targetNodeId: target.id,
    });
    if (pairs.length >= input.maxPairs) break;
  }

  return pairs;
}

function getNodeTags(node: MindAgentSource) {
  const tags = node.metadata.tags;
  return Array.isArray(tags)
    ? tags.filter((tag): tag is string => typeof tag === 'string' && !!tag)
    : [];
}

function normalizeMindPosition(
  node: MindAgentSource,
  nodes: MindAgentSource[]
) {
  const minX = Math.min(...nodes.map((item) => item.positionX));
  const minY = Math.min(...nodes.map((item) => item.positionY));
  const x = Math.round((node.positionX - minX) / 260) - 2;
  const z = Math.round((node.positionY - minY) / 220) - 2;

  return {
    x: Math.max(-12, Math.min(12, Number.isFinite(x) ? x : 0)),
    y: 1,
    z: Math.max(-12, Math.min(12, Number.isFinite(z) ? z : 0)),
  };
}

function clampInteger(
  value: number | null | undefined,
  min: number,
  fallback: number
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.trunc(value), fallback));
}

function truncateText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}...`;
}
