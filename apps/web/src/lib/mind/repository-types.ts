import 'server-only';

import type {
  Json,
  MindAiPatch,
  MindAiPatchRecord,
  MindBoardSummary,
  MindEdge,
  MindJsonObject,
  MindNode,
  MindNodeLink,
} from '@tuturuuu/types/db';
import type { Sql } from 'postgres';

type JsonField = Json | unknown;
type PostgresJson = Parameters<Sql['json']>[0];

export type JsonObject = MindJsonObject;

export type BoardRow = {
  canvas_view: JsonField | null;
  created_at: string;
  default_horizon: MindBoardSummary['defaultHorizon'];
  description: string | null;
  edge_count?: number | string | null;
  id: string;
  node_count?: number | string | null;
  settings: JsonField | null;
  status: MindBoardSummary['status'];
  tag_count?: number | string | null;
  title: string;
  updated_at: string;
  ws_id: string;
};

export type NodeRow = {
  body: string | null;
  color: string | null;
  created_at: string;
  height: number | string;
  horizon: MindNode['horizon'];
  id: string;
  metadata: JsonField | null;
  node_type: MindNode['nodeType'];
  parent_node_id: string | null;
  position_x: number | string;
  position_y: number | string;
  status: MindNode['status'];
  title: string;
  updated_at: string;
  width: number | string;
};

export type EdgeRow = {
  color: string | null;
  created_at: string;
  edge_type: MindEdge['edgeType'];
  id: string;
  label: string | null;
  metadata: JsonField | null;
  source_node_id: string;
  target_node_id: string;
  updated_at: string;
  weight: number | string;
};

export type TagRow = {
  color: string | null;
  created_at: string;
  id: string;
  name: string;
  node_ids: string[] | null;
};

export type LinkRow = {
  created_at: string;
  entity_id: string | null;
  entity_type: MindNodeLink['entityType'];
  id: string;
  label: string | null;
  metadata: JsonField | null;
  node_id: string;
  url: string | null;
};

export type PatchRow = {
  applied_at: string | null;
  board_id: string;
  created_at: string;
  created_by: string;
  id: string;
  patch: JsonField;
  status: MindAiPatchRecord['status'];
  summary: string;
  thread_id: string | null;
};

export function numberValue(
  value: number | string | null | undefined,
  fallback = 0
) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function asMindJson(value: unknown): PostgresJson {
  return value as PostgresJson;
}

export function jsonObject(value: JsonField | null | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as MindJsonObject)
    : {};
}

function nullableJsonObject(value: JsonField | null | undefined) {
  return value === null || value === undefined ? null : jsonObject(value);
}

export function mapBoard(row: BoardRow): MindBoardSummary {
  return {
    canvasView: nullableJsonObject(row.canvas_view),
    createdAt: row.created_at,
    defaultHorizon: row.default_horizon,
    description: row.description,
    edgeCount: numberValue(row.edge_count),
    id: row.id,
    nodeCount: numberValue(row.node_count),
    settings: jsonObject(row.settings),
    status: row.status,
    tagCount: numberValue(row.tag_count),
    title: row.title,
    updatedAt: row.updated_at,
    wsId: row.ws_id,
  };
}

export function mapNode(row: NodeRow): MindNode {
  return {
    body: row.body,
    color: row.color,
    createdAt: row.created_at,
    height: numberValue(row.height, 120),
    horizon: row.horizon,
    id: row.id,
    metadata: jsonObject(row.metadata),
    nodeType: row.node_type,
    parentNodeId: row.parent_node_id,
    positionX: numberValue(row.position_x),
    positionY: numberValue(row.position_y),
    status: row.status,
    title: row.title,
    updatedAt: row.updated_at,
    width: numberValue(row.width, 240),
  };
}

export function mapEdge(row: EdgeRow): MindEdge {
  return {
    color: row.color,
    createdAt: row.created_at,
    edgeType: row.edge_type,
    id: row.id,
    label: row.label,
    metadata: jsonObject(row.metadata),
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    updatedAt: row.updated_at,
    weight: numberValue(row.weight, 1),
  };
}

export function mapPatch(row: PatchRow): MindAiPatchRecord {
  return {
    appliedAt: row.applied_at,
    boardId: row.board_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    id: row.id,
    patch: row.patch as MindAiPatch,
    status: row.status,
    summary: row.summary,
    threadId: row.thread_id,
  };
}
