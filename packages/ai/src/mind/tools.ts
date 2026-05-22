import type {
  MindAiPatch,
  MindAiPatchRecord,
  MindBoardSnapshot,
  MindBoardSummary,
  MindJsonObject,
  MindNode,
  MindPatchOperation,
} from '@tuturuuu/types/db';
import type { ToolSet } from 'ai';
import { z } from 'zod';
import { tool } from '../tools/core';
import {
  buildRenderUiFailsafeSpec,
  isRenderableRenderUiSpec,
} from '../tools/mira-tool-render-ui';
import { normalizeRenderUiInputForTool } from '../tools/normalize-render-ui-input';

export type MindAiWriteMode = 'direct' | 'review';

const MIND_HORIZONS = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'five_year',
  'ten_year',
  'fifty_year',
  'long_arc',
] as const;
const MIND_NODE_TYPES = [
  'decision',
  'goal',
  'idea',
  'milestone',
  'plan',
  'question',
  'resource',
  'risk',
  'system',
] as const;
const MIND_NODE_STATUSES = [
  'backlog',
  'planned',
  'in_progress',
  'in_review',
  'blocked',
  'completed',
  'deferred',
  'cancelled',
] as const;
const MIND_EDGE_TYPES = [
  'blocks',
  'contains',
  'contradicts',
  'custom',
  'depends_on',
  'reference',
  'relates_to',
  'sequence',
  'supports',
] as const;

const mindHorizonSchema = z.enum(MIND_HORIZONS);
const mindNodeTypeSchema = z.enum(MIND_NODE_TYPES);
const mindNodeStatusSchema = z.enum(MIND_NODE_STATUSES);
const mindEdgeTypeSchema = z.enum(MIND_EDGE_TYPES);
const jsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);
const jsonSchema = z.union([
  jsonPrimitiveSchema,
  z.array(jsonPrimitiveSchema),
  z.record(z.string(), jsonPrimitiveSchema),
  z.array(z.record(z.string(), jsonPrimitiveSchema)),
]);
const mindMetadataSchema = z
  .record(z.string(), jsonSchema)
  .describe(
    'Flat JSON metadata. Use primitive values, primitive arrays, or shallow objects.'
  );

export type MindToolCallbacks = {
  applyPatch(input: {
    patchId: string;
    userId: string;
    wsId: string;
  }): Promise<MindAiPatchRecord | null>;
  createPatch(input: {
    boardId: string;
    patch: MindAiPatch;
    summary: string;
    threadId?: string | null;
    userId: string;
    wsId: string;
  }): Promise<MindAiPatchRecord | null>;
  getSnapshot(wsId: string, boardId: string): Promise<MindBoardSnapshot | null>;
  listBoards(wsId: string): Promise<MindBoardSummary[]>;
  searchNodes(input: {
    boardId?: string;
    q?: string;
    wsId: string;
  }): Promise<MindNode[]>;
};

export type MindToolContext = {
  boardId?: string | null;
  threadId?: string | null;
  userId: string;
  writeMode: MindAiWriteMode;
  wsId: string;
};

const patchOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('create_node'),
    node: z.object({
      body: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
      height: z.number().positive().optional(),
      horizon: mindHorizonSchema.optional(),
      id: z.string().trim().min(1).max(120).optional(),
      metadata: mindMetadataSchema.optional(),
      nodeType: mindNodeTypeSchema.optional(),
      parentNodeId: z.string().trim().min(1).max(120).nullable().optional(),
      positionX: z.number(),
      positionY: z.number(),
      status: mindNodeStatusSchema.optional(),
      title: z.string().min(1).max(240),
      width: z.number().positive().optional(),
    }),
  }),
  z.object({
    body: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    height: z.number().positive().optional(),
    horizon: mindHorizonSchema.optional(),
    id: z.string().min(1),
    kind: z.literal('update_node'),
    metadata: mindMetadataSchema.optional(),
    nodeId: z.guid(),
    nodeType: mindNodeTypeSchema.optional(),
    parentNodeId: z.guid().nullable().optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    status: mindNodeStatusSchema.optional(),
    title: z.string().min(1).max(240).optional(),
    width: z.number().positive().optional(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('delete_node'),
    nodeId: z.guid(),
  }),
  z.object({
    edge: z.object({
      color: z.string().nullable().optional(),
      edgeType: mindEdgeTypeSchema.optional(),
      id: z.string().trim().min(1).max(120).optional(),
      label: z.string().nullable().optional(),
      metadata: mindMetadataSchema.optional(),
      sourceNodeId: z.string().trim().min(1).max(120),
      targetNodeId: z.string().trim().min(1).max(120),
      weight: z.number().nonnegative().optional(),
    }),
    id: z.string().min(1),
    kind: z.literal('create_edge'),
  }),
  z.object({
    color: z.string().nullable().optional(),
    edgeId: z.guid(),
    edgeType: mindEdgeTypeSchema.optional(),
    id: z.string().min(1),
    kind: z.literal('update_edge'),
    label: z.string().nullable().optional(),
    metadata: mindMetadataSchema.optional(),
    sourceNodeId: z.guid().optional(),
    targetNodeId: z.guid().optional(),
    weight: z.number().nonnegative().optional(),
  }),
  z.object({
    edgeId: z.guid(),
    id: z.string().min(1),
    kind: z.literal('delete_edge'),
  }),
]);

const patchSchema = z.object({
  operations: z.array(patchOperationSchema).min(1).max(100),
  summary: z.string().min(1).max(2000),
});
const loosePatchOperationSchema = z
  .object({
    body: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    edge: z.record(z.string(), z.unknown()).optional(),
    edgeId: z.string().optional(),
    edgeType: z.string().optional(),
    height: z.number().optional(),
    horizon: z.string().optional(),
    id: z.string().optional(),
    kind: z.string(),
    label: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    node: z.record(z.string(), z.unknown()).optional(),
    nodeId: z.string().optional(),
    nodeType: z.string().optional(),
    parentNodeId: z.string().nullable().optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
    sourceNodeId: z.string().optional(),
    status: z.string().optional(),
    targetNodeId: z.string().optional(),
    title: z.string().optional(),
    weight: z.number().optional(),
    width: z.number().optional(),
  })
  .passthrough();
const loosePatchSchema = z
  .object({
    operations: z.array(loosePatchOperationSchema).min(1).max(100),
    summary: z.string().min(1).max(2000),
  })
  .passthrough();
const looseRenderLeafSchema = z
  .object({
    children: z.array(z.string()).optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    props: mindMetadataSchema.optional(),
    subtitle: z.string().optional(),
    title: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();
const looseRenderElementSchema = z
  .object({
    children: z.array(z.union([z.string(), looseRenderLeafSchema])).optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    props: mindMetadataSchema.optional(),
    subtitle: z.string().optional(),
    title: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();
const looseRenderMindUiSchema = z
  .object({
    elements: z
      .union([
        z.array(looseRenderElementSchema),
        z.record(
          z.string(),
          z.union([looseRenderElementSchema, z.array(looseRenderElementSchema)])
        ),
      ])
      .optional(),
    items: z.array(looseRenderElementSchema).optional(),
    root: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const toolBoardIdSchema = z.string().trim().min(1).max(120).optional();

function resolveBoardId(ctx: MindToolContext, boardId?: string | null) {
  if (boardId && isUuid(boardId)) return boardId;
  return ctx.boardId ?? boardId ?? null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value
  );
}

function readRecordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readMindMetadata(value: unknown): MindJsonObject | undefined {
  const parsed = mindMetadataSchema.safeParse(value);
  return parsed.success ? (parsed.data as MindJsonObject) : undefined;
}

function readStringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNullableStringValue(value: unknown) {
  if (value === null) return null;
  return readStringValue(value);
}

function readNumberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readPositiveNumberValue(value: unknown) {
  const number = readNumberValue(value);
  return number && number > 0 ? number : undefined;
}

function pickEnumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  aliases: Record<string, T[number]> = {}
): T[number] {
  const raw = readStringValue(value)?.toLowerCase().replaceAll('-', '_');
  if (!raw) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T[number];
  return aliases[raw] ?? fallback;
}

function coercePatchOperation(
  operation: z.infer<typeof loosePatchOperationSchema>,
  index: number
): MindPatchOperation | null {
  const nestedNode = readRecordValue(operation.node);
  const nestedEdge = readRecordValue(operation.edge);
  const id = readStringValue(operation.id) ?? `op_${index + 1}`;
  const kind = operation.kind.trim();

  if (kind === 'create_node') {
    const nodeId =
      readStringValue(nestedNode.id) ??
      readStringValue(nestedNode.nodeId) ??
      id;
    const title =
      readStringValue(nestedNode.title) ??
      readStringValue(operation.title) ??
      'Untitled node';

    return {
      id,
      kind,
      node: {
        body:
          readNullableStringValue(nestedNode.body) ??
          readNullableStringValue(operation.body) ??
          null,
        color:
          readNullableStringValue(nestedNode.color) ??
          readNullableStringValue(operation.color),
        height:
          readPositiveNumberValue(nestedNode.height) ??
          readPositiveNumberValue(operation.height),
        horizon: pickEnumValue(
          nestedNode.horizon ?? operation.horizon,
          MIND_HORIZONS,
          'month'
        ),
        id: nodeId,
        metadata: readMindMetadata(nestedNode.metadata ?? operation.metadata),
        nodeType: pickEnumValue(
          nestedNode.nodeType ?? operation.nodeType,
          MIND_NODE_TYPES,
          'idea',
          {
            action: 'idea',
            task: 'idea',
            review: 'milestone',
            review_point: 'milestone',
          }
        ),
        parentNodeId:
          readNullableStringValue(nestedNode.parentNodeId) ??
          readNullableStringValue(operation.parentNodeId),
        positionX:
          readNumberValue(nestedNode.positionX) ??
          readNumberValue(operation.positionX) ??
          index * 320,
        positionY:
          readNumberValue(nestedNode.positionY) ??
          readNumberValue(operation.positionY) ??
          240,
        status: pickEnumValue(
          nestedNode.status ?? operation.status,
          MIND_NODE_STATUSES,
          'planned'
        ),
        title,
        width:
          readPositiveNumberValue(nestedNode.width) ??
          readPositiveNumberValue(operation.width),
      },
    };
  }

  if (kind === 'update_node') {
    const nodeId =
      readStringValue(operation.nodeId) ??
      readStringValue(nestedNode.nodeId) ??
      readStringValue(nestedNode.id);
    if (!nodeId) return null;

    return {
      body:
        readNullableStringValue(nestedNode.body) ??
        readNullableStringValue(operation.body),
      color:
        readNullableStringValue(nestedNode.color) ??
        readNullableStringValue(operation.color),
      height:
        readPositiveNumberValue(nestedNode.height) ??
        readPositiveNumberValue(operation.height),
      horizon:
        nestedNode.horizon || operation.horizon
          ? pickEnumValue(
              nestedNode.horizon ?? operation.horizon,
              MIND_HORIZONS,
              'month'
            )
          : undefined,
      id,
      kind,
      metadata:
        nestedNode.metadata || operation.metadata
          ? readMindMetadata(nestedNode.metadata ?? operation.metadata)
          : undefined,
      nodeId,
      nodeType:
        nestedNode.nodeType || operation.nodeType
          ? pickEnumValue(
              nestedNode.nodeType ?? operation.nodeType,
              MIND_NODE_TYPES,
              'idea',
              { action: 'idea', task: 'idea' }
            )
          : undefined,
      parentNodeId:
        readNullableStringValue(nestedNode.parentNodeId) ??
        readNullableStringValue(operation.parentNodeId),
      positionX:
        readNumberValue(nestedNode.positionX) ??
        readNumberValue(operation.positionX),
      positionY:
        readNumberValue(nestedNode.positionY) ??
        readNumberValue(operation.positionY),
      status:
        nestedNode.status || operation.status
          ? pickEnumValue(
              nestedNode.status ?? operation.status,
              MIND_NODE_STATUSES,
              'planned'
            )
          : undefined,
      title:
        readStringValue(nestedNode.title) ?? readStringValue(operation.title),
      width:
        readPositiveNumberValue(nestedNode.width) ??
        readPositiveNumberValue(operation.width),
    };
  }

  if (kind === 'delete_node') {
    const nodeId =
      readStringValue(operation.nodeId) ??
      readStringValue(nestedNode.nodeId) ??
      readStringValue(nestedNode.id);
    return nodeId ? { id, kind, nodeId } : null;
  }

  if (kind === 'create_edge') {
    const edgeId =
      readStringValue(nestedEdge.id) ??
      readStringValue(nestedEdge.edgeId) ??
      id;
    const sourceNodeId =
      readStringValue(nestedEdge.sourceNodeId) ??
      readStringValue(operation.sourceNodeId);
    const targetNodeId =
      readStringValue(nestedEdge.targetNodeId) ??
      readStringValue(operation.targetNodeId);
    if (!sourceNodeId || !targetNodeId) return null;

    return {
      edge: {
        color:
          readNullableStringValue(nestedEdge.color) ??
          readNullableStringValue(operation.color),
        edgeType: pickEnumValue(
          nestedEdge.edgeType ?? operation.edgeType,
          MIND_EDGE_TYPES,
          'relates_to',
          {
            prerequisite: 'depends_on',
            requires: 'depends_on',
            validates: 'supports',
          }
        ),
        id: edgeId,
        label:
          readNullableStringValue(nestedEdge.label) ??
          readNullableStringValue(operation.label),
        metadata: readMindMetadata(nestedEdge.metadata ?? operation.metadata),
        sourceNodeId,
        targetNodeId,
        weight:
          readNumberValue(nestedEdge.weight) ??
          readNumberValue(operation.weight),
      },
      id,
      kind,
    };
  }

  if (kind === 'update_edge') {
    const edgeId =
      readStringValue(operation.edgeId) ??
      readStringValue(nestedEdge.edgeId) ??
      readStringValue(nestedEdge.id);
    if (!edgeId) return null;

    return {
      color:
        readNullableStringValue(nestedEdge.color) ??
        readNullableStringValue(operation.color),
      edgeId,
      edgeType:
        nestedEdge.edgeType || operation.edgeType
          ? pickEnumValue(
              nestedEdge.edgeType ?? operation.edgeType,
              MIND_EDGE_TYPES,
              'relates_to',
              {
                prerequisite: 'depends_on',
                requires: 'depends_on',
                validates: 'supports',
              }
            )
          : undefined,
      id,
      kind,
      label:
        readNullableStringValue(nestedEdge.label) ??
        readNullableStringValue(operation.label),
      metadata:
        nestedEdge.metadata || operation.metadata
          ? readMindMetadata(nestedEdge.metadata ?? operation.metadata)
          : undefined,
      sourceNodeId:
        readStringValue(nestedEdge.sourceNodeId) ??
        readStringValue(operation.sourceNodeId),
      targetNodeId:
        readStringValue(nestedEdge.targetNodeId) ??
        readStringValue(operation.targetNodeId),
      weight:
        readNumberValue(nestedEdge.weight) ?? readNumberValue(operation.weight),
    };
  }

  if (kind === 'delete_edge') {
    const edgeId =
      readStringValue(operation.edgeId) ??
      readStringValue(nestedEdge.edgeId) ??
      readStringValue(nestedEdge.id);
    return edgeId ? { edgeId, id, kind } : null;
  }

  return null;
}

export function coerceMindAiPatch(
  patch: z.infer<typeof loosePatchSchema>
): MindAiPatch | { issues: string[] } {
  const operations = patch.operations.flatMap((operation, index) => {
    const coerced = coercePatchOperation(operation, index);
    return coerced ? [coerced] : [];
  });

  const parsed = patchSchema.safeParse({
    operations,
    summary: patch.summary,
  });

  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'patch'}: ${issue.message}`
      ),
    };
  }

  return parsed.data as MindAiPatch;
}

export function normalizeGeneratedPatchIds(
  patch: MindAiPatch | z.infer<typeof patchSchema>
) {
  const idMap = new Map<string, string>();

  const assignGeneratedId = (key: string) => {
    const existing = idMap.get(key);
    if (existing) return existing;
    const nextId = crypto.randomUUID();
    idMap.set(key, nextId);
    return nextId;
  };

  const resolveId = (value?: string | null, fallback?: string) => {
    const key = value?.trim() || fallback?.trim();
    if (!key) return crypto.randomUUID();
    if (isUuid(key)) return key;
    return assignGeneratedId(key);
  };

  patch.operations.forEach((operation, index) => {
    if (operation.kind !== 'create_node') return;

    const nodeId = resolveId(
      operation.node.id,
      operation.id || `create_node_${index + 1}`
    );
    idMap.set(operation.id, nodeId);
    if (operation.node.id) idMap.set(operation.node.id, nodeId);
  });

  return {
    ...patch,
    operations: patch.operations.map((operation, index) => {
      if (operation.kind === 'create_node') {
        const nodeId = resolveId(
          operation.node.id,
          operation.id || `create_node_${index + 1}`
        );

        return {
          ...operation,
          node: {
            ...operation.node,
            id: nodeId,
            parentNodeId: operation.node.parentNodeId
              ? resolveId(operation.node.parentNodeId)
              : operation.node.parentNodeId,
          },
        };
      }

      if (operation.kind === 'create_edge') {
        const edgeId = resolveId(
          operation.edge.id,
          operation.id || `create_edge_${index + 1}`
        );

        return {
          ...operation,
          edge: {
            ...operation.edge,
            id: edgeId,
            sourceNodeId: resolveId(operation.edge.sourceNodeId),
            targetNodeId: resolveId(operation.edge.targetNodeId),
          },
        };
      }

      if (operation.kind === 'update_node') {
        return {
          ...operation,
          parentNodeId: operation.parentNodeId
            ? resolveId(operation.parentNodeId)
            : operation.parentNodeId,
        };
      }

      if (operation.kind === 'update_edge') {
        return {
          ...operation,
          sourceNodeId: operation.sourceNodeId
            ? resolveId(operation.sourceNodeId)
            : operation.sourceNodeId,
          targetNodeId: operation.targetNodeId
            ? resolveId(operation.targetNodeId)
            : operation.targetNodeId,
        };
      }

      return operation;
    }),
  } satisfies MindAiPatch;
}

function describePatchOperation(operation: MindPatchOperation) {
  if (operation.kind === 'create_node') {
    return operation.node.title || operation.id;
  }
  if (operation.kind === 'update_node') {
    return operation.title || operation.nodeId;
  }
  if (operation.kind === 'create_edge') {
    return operation.edge.label || operation.id;
  }
  if (operation.kind === 'update_edge') {
    return operation.label || operation.edgeId;
  }
  if (operation.kind === 'delete_node') return operation.nodeId;
  return operation.edgeId;
}

function validateMindPatchReferences({
  patch,
  snapshot,
}: {
  patch: MindAiPatch;
  snapshot: MindBoardSnapshot;
}) {
  const existingNodeIds = new Set(snapshot.nodes.map((node) => node.id));
  const existingEdgeIds = new Set(snapshot.edges.map((edge) => edge.id));
  const createdNodeRefs = new Set<string>();
  const issues: string[] = [];

  for (const operation of patch.operations) {
    if (operation.kind !== 'create_node') continue;
    createdNodeRefs.add(operation.id);
    if (operation.node.id) createdNodeRefs.add(operation.node.id);
  }

  const nodeRefExists = (nodeId: string) =>
    existingNodeIds.has(nodeId) || createdNodeRefs.has(nodeId);
  const existingNodeRefExists = (nodeId: string) => existingNodeIds.has(nodeId);

  const pushMissingNode = (
    operation: MindPatchOperation,
    nodeId: string,
    role: string
  ) => {
    issues.push(
      `Missing node reference for ${role} in ${operation.kind} "${describePatchOperation(
        operation
      )}": ${nodeId}`
    );
  };

  const pushMissingEdge = (
    operation: MindPatchOperation,
    edgeId: string,
    role: string
  ) => {
    issues.push(
      `Missing edge reference for ${role} in ${operation.kind} "${describePatchOperation(
        operation
      )}": ${edgeId}`
    );
  };

  for (const operation of patch.operations) {
    if (operation.kind === 'create_node') {
      const parentNodeId = operation.node.parentNodeId;
      if (parentNodeId && !nodeRefExists(parentNodeId)) {
        pushMissingNode(operation, parentNodeId, 'parentNodeId');
      }
      continue;
    }

    if (operation.kind === 'update_node') {
      if (!existingNodeRefExists(operation.nodeId)) {
        pushMissingNode(operation, operation.nodeId, 'nodeId');
      }
      if (operation.parentNodeId && !nodeRefExists(operation.parentNodeId)) {
        pushMissingNode(operation, operation.parentNodeId, 'parentNodeId');
      }
      continue;
    }

    if (operation.kind === 'delete_node') {
      if (!existingNodeRefExists(operation.nodeId)) {
        pushMissingNode(operation, operation.nodeId, 'nodeId');
      }
      continue;
    }

    if (operation.kind === 'create_edge') {
      if (!nodeRefExists(operation.edge.sourceNodeId)) {
        pushMissingNode(operation, operation.edge.sourceNodeId, 'sourceNodeId');
      }
      if (!nodeRefExists(operation.edge.targetNodeId)) {
        pushMissingNode(operation, operation.edge.targetNodeId, 'targetNodeId');
      }
      continue;
    }

    if (operation.kind === 'update_edge') {
      if (!existingEdgeIds.has(operation.edgeId)) {
        pushMissingEdge(operation, operation.edgeId, 'edgeId');
      }
      if (operation.sourceNodeId && !nodeRefExists(operation.sourceNodeId)) {
        pushMissingNode(operation, operation.sourceNodeId, 'sourceNodeId');
      }
      if (operation.targetNodeId && !nodeRefExists(operation.targetNodeId)) {
        pushMissingNode(operation, operation.targetNodeId, 'targetNodeId');
      }
      continue;
    }

    if (!existingEdgeIds.has(operation.edgeId)) {
      pushMissingEdge(operation, operation.edgeId, 'edgeId');
    }
  }

  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeElementId(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  return normalized || fallback;
}

function readText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toMindRenderSpec(input: unknown) {
  const normalized = normalizeRenderUiInputForTool(input);
  if (isRecord(normalized) && isRenderableRenderUiSpec(normalized)) {
    return normalized;
  }

  const source = isRecord(normalized) ? normalized : {};
  const elements = source.elements;
  const title =
    readText(source.root) ?? readText(source.title) ?? 'Generated plan';
  const convertedElements: Record<string, unknown> = {};
  const rootChildren: string[] = [];

  const addElement = (id: string, element: Record<string, unknown>) => {
    convertedElements[id] = element;
    return id;
  };

  const convertOutlineItem = (
    raw: unknown,
    fallbackId: string,
    topLevel = false
  ): string => {
    if (!isRecord(raw)) {
      return addElement(fallbackId, {
        children: [],
        props: { content: String(raw) },
        type: 'Text',
      });
    }

    const rawChildren = Array.isArray(raw.children) ? raw.children : [];
    const itemTitle =
      readText(raw.title) ??
      readText(raw.content) ??
      readText(raw.name) ??
      'Generated item';
    const id = sanitizeElementId(readText(raw.id) ?? itemTitle, fallbackId);

    if (readText(raw.type)) {
      const childIds = rawChildren.map((child, index) =>
        typeof child === 'string'
          ? child
          : convertOutlineItem(child, `${id}_${index + 1}`)
      );
      return addElement(id, {
        ...raw,
        children: childIds,
        props: isRecord(raw.props) ? raw.props : {},
        type: readText(raw.type),
      });
    }

    if (!rawChildren.length && !topLevel) {
      return addElement(id, {
        children: [],
        props: {
          subtitle: readText(raw.subtitle) ?? readText(raw.description),
          title: itemTitle,
        },
        type: 'ListItem',
      });
    }

    const childIds = rawChildren.map((child, index) =>
      typeof child === 'string'
        ? child
        : convertOutlineItem(child, `${id}_${index + 1}`)
    );

    return addElement(id, {
      children: childIds,
      props: {
        description: readText(raw.description),
        title: itemTitle,
      },
      type: 'Card',
    });
  };

  if (Array.isArray(elements)) {
    elements.forEach((item, index) => {
      rootChildren.push(convertOutlineItem(item, `item_${index + 1}`, true));
    });
  } else if (isRecord(elements)) {
    for (const [key, value] of Object.entries(elements)) {
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          rootChildren.push(
            convertOutlineItem(
              item,
              `${sanitizeElementId(key, 'item')}_${index + 1}`,
              true
            )
          );
        });
      } else {
        rootChildren.push(
          convertOutlineItem(value, sanitizeElementId(key, 'item'), true)
        );
      }
    }
  } else if (Array.isArray(source.items)) {
    source.items.forEach((item, index) => {
      rootChildren.push(convertOutlineItem(item, `item_${index + 1}`, true));
    });
  }

  const rootId = 'mind_generated_ui';
  return {
    elements: {
      [rootId]: {
        children: rootChildren.length ? rootChildren : ['mind_generated_empty'],
        props: { title },
        type: 'Card',
      },
      ...convertedElements,
      ...(rootChildren.length
        ? {}
        : {
            mind_generated_empty: {
              children: [],
              props: {
                content:
                  'Mind could not infer a visual structure from this draft.',
                title: 'Draft view unavailable',
                variant: 'warning',
              },
              type: 'Callout',
            },
          }),
    },
    root: rootId,
  };
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>(
    (acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    },
    {} as Record<T, number>
  );
}

function getGraphDegree(snapshot: MindBoardSnapshot) {
  const degree = new Map<string, number>();
  for (const edge of snapshot.edges) {
    degree.set(edge.sourceNodeId, (degree.get(edge.sourceNodeId) ?? 0) + 1);
    degree.set(edge.targetNodeId, (degree.get(edge.targetNodeId) ?? 0) + 1);
  }
  return degree;
}

function createStructureInspection(snapshot: MindBoardSnapshot) {
  const degree = getGraphDegree(snapshot);
  const highDegreeNodes = [...snapshot.nodes]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, 12)
    .map((node) => ({
      degree: degree.get(node.id) ?? 0,
      horizon: node.horizon,
      id: node.id,
      status: node.status,
      title: node.title,
      type: node.nodeType,
    }));
  const allIsolatedNodes = snapshot.nodes.filter(
    (node) => (degree.get(node.id) ?? 0) === 0
  );
  const isolatedNodes = allIsolatedNodes.slice(0, 25).map((node) => ({
    horizon: node.horizon,
    id: node.id,
    status: node.status,
    title: node.title,
    type: node.nodeType,
  }));

  return {
    board: snapshot.board,
    chunkStrategy: {
      recommendedLimit: snapshot.nodes.length > 500 ? 80 : 120,
      recommendedOrder:
        'Inspect structure first, search for the user topic, load the neighborhood around relevant nodes, then use paged chunks only for broad audits.',
      totalChunksAt80: Math.ceil(snapshot.nodes.length / 80),
    },
    counts: {
      byHorizon: countBy(snapshot.nodes.map((node) => node.horizon)),
      byStatus: countBy(snapshot.nodes.map((node) => node.status)),
      byType: countBy(snapshot.nodes.map((node) => node.nodeType)),
      edges: snapshot.edges.length,
      groups: snapshot.groups.length,
      isolatedNodes: allIsolatedNodes.length,
      nodes: snapshot.nodes.length,
      tags: snapshot.tags.length,
    },
    highDegreeNodes,
    isolatedNodes,
    tags: snapshot.tags.slice(0, 50).map((tag) => ({
      id: tag.id,
      name: tag.name,
      nodeCount: tag.nodeIds.length,
    })),
  };
}

function loadNeighborhood({
  depth,
  limit,
  nodeId,
  snapshot,
}: {
  depth: number;
  limit: number;
  nodeId: string;
  snapshot: MindBoardSnapshot;
}) {
  const visited = new Set([nodeId]);
  let frontier = new Set([nodeId]);

  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of snapshot.edges) {
      if (frontier.has(edge.sourceNodeId)) next.add(edge.targetNodeId);
      if (frontier.has(edge.targetNodeId)) next.add(edge.sourceNodeId);
    }
    for (const id of next) visited.add(id);
    frontier = next;
    if (visited.size >= limit) break;
  }

  const limitedIds = new Set([...visited].slice(0, limit));
  const nodes = snapshot.nodes.filter((node) => limitedIds.has(node.id));
  const edges = snapshot.edges.filter(
    (edge) =>
      limitedIds.has(edge.sourceNodeId) && limitedIds.has(edge.targetNodeId)
  );

  return {
    edges,
    hasMore: visited.size > limitedIds.size,
    nodes,
    requestedNodeId: nodeId,
    totalVisited: visited.size,
  };
}

export function createMindStreamTools(
  ctx: MindToolContext,
  callbacks: MindToolCallbacks
): ToolSet {
  return {
    apply_mind_patch: tool({
      description:
        'Apply a previously proposed Mind patch. Only succeeds when the current chat is in Implement mode.',
      inputSchema: z.object({
        patchId: z.string().trim().min(1).max(120),
      }),
      execute: async ({ patchId }) => {
        if (ctx.writeMode !== 'direct') {
          return {
            ok: false,
            reason:
              'This chat is in Draft mode. The user must apply the patch manually.',
          };
        }
        if (!isUuid(patchId)) {
          return { ok: false, reason: 'Patch id must be a UUID.' };
        }

        const patch = await callbacks
          .applyPatch({
            patchId,
            userId: ctx.userId,
            wsId: ctx.wsId,
          })
          .catch((error) => ({
            error:
              error instanceof Error && error.message
                ? error.message
                : 'Patch application failed.',
          }));

        if (patch && 'error' in patch) {
          return { ok: false, reason: patch.error };
        }

        return patch
          ? { ok: true, patch }
          : { ok: false, reason: 'Patch was not found.' };
      },
    }),
    get_mindboard_snapshot: tool({
      description:
        'Load a complete Mind board snapshot including nodes, edges, tags, groups, links, and recent AI patches.',
      inputSchema: z.object({
        boardId: toolBoardIdSchema,
      }),
      execute: async ({ boardId }) => {
        const resolvedBoardId = resolveBoardId(ctx, boardId);
        if (!resolvedBoardId) {
          return { ok: false, reason: 'No Mind board is selected.' };
        }

        const snapshot = await callbacks.getSnapshot(ctx.wsId, resolvedBoardId);
        return snapshot
          ? { ok: true, snapshot }
          : { ok: false, reason: 'Mind board was not found.' };
      },
    }),
    list_mindboards: tool({
      description:
        'List active Mind boards in the current workspace with graph counts.',
      inputSchema: z.object({}),
      execute: async () => ({
        boards: await callbacks.listBoards(ctx.wsId),
        ok: true,
      }),
    }),
    load_mind_chunk: tool({
      description:
        'Load a chunk of nodes and all edges connected to those nodes from a Mind board.',
      inputSchema: z.object({
        boardId: toolBoardIdSchema,
        limit: z.number().int().min(1).max(200).default(80),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async ({ boardId, limit, offset }) => {
        const resolvedBoardId = resolveBoardId(ctx, boardId);
        if (!resolvedBoardId) {
          return { ok: false, reason: 'No Mind board is selected.' };
        }

        const snapshot = await callbacks.getSnapshot(ctx.wsId, resolvedBoardId);
        if (!snapshot)
          return { ok: false, reason: 'Mind board was not found.' };

        const nodes = snapshot.nodes.slice(offset, offset + limit);
        const nodeIds = new Set(nodes.map((node) => node.id));
        const edges = snapshot.edges.filter(
          (edge) =>
            nodeIds.has(edge.sourceNodeId) || nodeIds.has(edge.targetNodeId)
        );

        return {
          board: snapshot.board,
          edges,
          hasMore: offset + limit < snapshot.nodes.length,
          nodes,
          ok: true,
          totalNodes: snapshot.nodes.length,
        };
      },
    }),
    load_mind_neighborhood: tool({
      description:
        'Load the local graph neighborhood around a specific node. Prefer this over full snapshots when refining one idea in a large board.',
      inputSchema: z.object({
        boardId: toolBoardIdSchema,
        depth: z.number().int().min(1).max(3).default(1),
        limit: z.number().int().min(5).max(150).default(80),
        nodeId: z.guid(),
      }),
      execute: async ({ boardId, depth, limit, nodeId }) => {
        const resolvedBoardId = resolveBoardId(ctx, boardId);
        if (!resolvedBoardId) {
          return { ok: false, reason: 'No Mind board is selected.' };
        }

        const snapshot = await callbacks.getSnapshot(ctx.wsId, resolvedBoardId);
        if (!snapshot)
          return { ok: false, reason: 'Mind board was not found.' };

        return {
          ok: true,
          ...loadNeighborhood({ depth, limit, nodeId, snapshot }),
        };
      },
    }),
    inspect_mind_structure: tool({
      description:
        'Inspect board organization before planning changes. Returns counts by horizon, status, and type plus high-degree and isolated nodes so large boards can be navigated in chunks.',
      inputSchema: z.object({
        boardId: toolBoardIdSchema,
      }),
      execute: async ({ boardId }) => {
        const resolvedBoardId = resolveBoardId(ctx, boardId);
        if (!resolvedBoardId) {
          return { ok: false, reason: 'No Mind board is selected.' };
        }

        const snapshot = await callbacks.getSnapshot(ctx.wsId, resolvedBoardId);
        if (!snapshot)
          return { ok: false, reason: 'Mind board was not found.' };

        return { ok: true, structure: createStructureInspection(snapshot) };
      },
    }),
    propose_mind_patch: tool({
      description:
        'Create a structured applyable Mind draft patch for user review or implementation.',
      inputSchema: z.object({
        boardId: toolBoardIdSchema,
        patch: loosePatchSchema,
      }),
      execute: async ({ boardId, patch }) => {
        const resolvedBoardId = resolveBoardId(ctx, boardId);
        if (!resolvedBoardId) {
          return { ok: false, reason: 'No Mind board is selected.' };
        }
        const coercedPatch = coerceMindAiPatch(patch);
        if ('issues' in coercedPatch) {
          return {
            ok: false,
            reason: `Patch draft was not applyable: ${coercedPatch.issues
              .slice(0, 6)
              .join('; ')}`,
          };
        }

        const snapshot = await callbacks.getSnapshot(ctx.wsId, resolvedBoardId);
        if (!snapshot) {
          return { ok: false, reason: 'Mind board was not found.' };
        }

        const referenceIssues = validateMindPatchReferences({
          patch: coercedPatch,
          snapshot,
        });
        if (referenceIssues.length > 0) {
          return {
            ok: false,
            reason: `Patch draft referenced graph items that are not available: ${referenceIssues
              .slice(0, 6)
              .join('; ')}`,
          };
        }

        const record = await callbacks
          .createPatch({
            boardId: resolvedBoardId,
            patch: normalizeGeneratedPatchIds(coercedPatch),
            summary: coercedPatch.summary,
            threadId: ctx.threadId,
            userId: ctx.userId,
            wsId: ctx.wsId,
          })
          .catch((error) => ({
            error:
              error instanceof Error && error.message
                ? error.message
                : 'Patch creation failed.',
          }));

        if (record && 'error' in record) {
          return { ok: false, reason: record.error };
        }

        return record
          ? {
              directWriteAvailable: ctx.writeMode === 'direct',
              ok: true,
              patch: record,
            }
          : { ok: false, reason: 'Failed to create Mind patch.' };
      },
    }),
    render_mind_ui: tool({
      description:
        'Render compact native UI for Mind planning responses. Use this for visual draft summaries, patch previews, timelines, comparisons, metrics, and structured planning cards instead of pasting large JSON blocks.',
      inputSchema: looseRenderMindUiSchema,
      execute: async (input) => {
        const spec = toMindRenderSpec(input);
        if (isRenderableRenderUiSpec(spec)) {
          return { ok: true, spec };
        }

        return {
          ok: false,
          spec: buildRenderUiFailsafeSpec(
            isRecord(spec) ? spec : { root: 'mind_generated_ui' }
          ),
          warning:
            'The generated UI spec needed recovery. Ensure root exists in elements and every element has type, props, and children.',
        };
      },
    }),
    search_mind_nodes: tool({
      description:
        'Search Mind nodes in the current workspace or selected board by title and body.',
      inputSchema: z.object({
        boardId: toolBoardIdSchema,
        q: z.string().trim().min(1).max(200),
      }),
      execute: async ({ boardId, q }) => ({
        nodes: await callbacks.searchNodes({
          boardId: resolveBoardId(ctx, boardId) ?? undefined,
          q,
          wsId: ctx.wsId,
        }),
        ok: true,
      }),
    }),
  };
}
