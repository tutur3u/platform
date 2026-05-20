import type {
  MindEdgeType,
  MindHorizon,
  MindNode,
  MindNodeStatus,
  MindNodeType,
} from '@tuturuuu/types/db';

export const MIND_HORIZONS: MindHorizon[] = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'five_year',
  'ten_year',
  'fifty_year',
  'long_arc',
];

export const MIND_NODE_TYPES: MindNodeType[] = [
  'idea',
  'goal',
  'plan',
  'milestone',
  'question',
  'risk',
  'decision',
  'resource',
  'system',
];

export const MIND_NODE_STATUSES: MindNodeStatus[] = [
  'backlog',
  'planned',
  'in_progress',
  'in_review',
  'blocked',
  'completed',
  'deferred',
  'cancelled',
];

export const MIND_EDGE_TYPES: MindEdgeType[] = [
  'relates_to',
  'contains',
  'depends_on',
  'supports',
  'blocks',
  'sequence',
  'contradicts',
  'reference',
  'custom',
];

export const NODE_COLORS = [
  '#2f80ed',
  '#14b8a6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#64748b',
] as const;

export const NODE_STATUS_COLORS: Record<MindNodeStatus, string> = {
  backlog: '#64748b',
  blocked: '#ef4444',
  cancelled: '#78716c',
  completed: '#22c55e',
  deferred: '#a855f7',
  in_progress: '#2f80ed',
  in_review: '#f59e0b',
  planned: '#14b8a6',
};

export type MindNodeMetadata = {
  group?: string;
  tags?: string[];
};

export function getNodeMetadata(node: Pick<MindNode, 'metadata'>) {
  const metadata = node.metadata as MindNodeMetadata;
  return {
    group: typeof metadata.group === 'string' ? metadata.group : '',
    tags: Array.isArray(metadata.tags)
      ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
  };
}

export function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}
