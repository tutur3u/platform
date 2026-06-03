import { getHiveObjectStateFootprintValidationError } from '@tuturuuu/realtime/hive';
import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';
import type {
  HiveWorkflowDefinition,
  HiveWorkflowEdge,
  HiveWorkflowNode,
  HiveWorkflowNodeType,
  HiveWorkflowStepTrace,
} from './workflow-types';
import {
  groupHiveWorkflowEdgesBySource,
  validateHiveWorkflowDefinition,
} from './workflow-validation';
import { getHiveWorkflowWorldEventConfig } from './workflow-world-patch';

const MAX_WORKFLOW_STEPS = 120;
const REFERENCE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/gu;
const FULL_REFERENCE_PATTERN = /^\{\{\s*([^{}]+?)\s*\}\}$/u;

type WorkflowContext = {
  input: Record<string, unknown>;
  steps: Record<string, { output: unknown }>;
};

type WorkflowCapabilityPayload = Record<string, unknown>;

const hiveVectorSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const hiveJsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(hiveJsonSchema),
    z.record(z.string(), hiveJsonSchema),
  ])
);

const hiveJsonObjectSchema = z.record(z.string(), hiveJsonSchema);

const hiveObjectStateSchema = hiveJsonObjectSchema.superRefine((state, ctx) => {
  const error = getHiveObjectStateFootprintValidationError(
    state as Record<string, unknown>
  );

  if (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error.message,
      path: error.path,
    });
  }
});

const hiveWorldSchema = z.object({
  blocks: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        position: hiveVectorSchema,
        state: hiveJsonObjectSchema.optional(),
        type: z.string().trim().min(1).max(80),
      })
    )
    .max(10_000),
  objects: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        position: hiveVectorSchema,
        rotation: z.number().finite().optional(),
        state: hiveObjectStateSchema.optional(),
        type: z.string().trim().min(1).max(80),
      })
    )
    .max(2_000),
});

const hiveWorldPatchBlockSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  position: hiveVectorSchema,
  state: hiveJsonObjectSchema.optional(),
  type: z.string().trim().min(1).max(80),
});

const hiveWorldPatchObjectSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  position: hiveVectorSchema,
  rotation: z.number().finite().optional(),
  state: hiveObjectStateSchema.optional(),
  type: z.string().trim().min(1).max(80),
});

const ownerTypeSchema = z.enum(['npc', 'warehouse']);

const workflowWarehouseConfigSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    capacity: z.number().int().min(1).max(50_000).default(500),
    name: z.string().trim().min(1).max(120),
    position: hiveVectorSchema,
  }),
  z.object({
    action: z.literal('transfer'),
    fromOwnerId: z.string().uuid(),
    fromOwnerType: ownerTypeSchema,
    itemType: z.string().trim().min(1).max(80),
    quantity: z.number().int().min(1).max(10_000),
    toOwnerId: z.string().uuid(),
    toOwnerType: ownerTypeSchema,
  }),
]);

const workflowTradeConfigSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    expiresAt: z.string().datetime().nullable().optional(),
    fromNpcId: z.string().uuid(),
    offeredCurrency: z.number().min(0).default(0),
    offeredItems: z.array(hiveJsonSchema).default([]),
    requestedCurrency: z.number().min(0).default(0),
    requestedItems: z.array(hiveJsonSchema).default([]),
    toNpcId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    acceptingNpcId: z.string().uuid(),
    action: z.literal('accept'),
    tradeId: z.string().uuid(),
  }),
]);

const workflowFarmingConfigSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('plant'),
    cropType: z.string().trim().min(1).max(80).default('turnip'),
    npcId: z.string().uuid().optional(),
    position: hiveVectorSchema,
  }),
  z.object({
    action: z.literal('water'),
    cropId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('harvest'),
    cropId: z.string().uuid(),
    npcId: z.string().uuid().optional(),
  }),
]);

const workflowNpcPatchSchema = z
  .object({
    backstory: z.string().max(10_000).optional(),
    backstoryEnabled: z.boolean().optional(),
    customPromptEnabled: z.boolean().optional(),
    memoryEnabled: z.boolean().optional(),
    model: z.string().trim().min(1).max(120).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    position: hiveVectorSchema.optional(),
    role: z.string().trim().min(1).max(200).optional(),
    settings: hiveJsonObjectSchema.optional(),
    systemPrompt: z.string().max(20_000).optional(),
  })
  .strict();

const workflowUpdateNpcConfigSchema = z.object({
  npcId: z.string().uuid(),
  patch: workflowNpcPatchSchema,
});

const workflowNpcDecisionConfigSchema = z.object({
  intent: z.string().trim().min(1).max(4000).optional(),
  npcId: z.string().uuid(),
  spokenText: z.string().max(4000).optional(),
});

const workflowWorldPatchSchema = z.object({
  blocks: z.array(hiveWorldPatchBlockSchema).max(10_000).optional(),
  clear: z.boolean().optional(),
  objects: z.array(hiveWorldPatchObjectSchema).max(2_000).optional(),
  removeBlockIds: z
    .array(z.string().trim().min(1).max(120))
    .max(10_000)
    .optional(),
  removeObjectIds: z
    .array(z.string().trim().min(1).max(120))
    .max(2_000)
    .optional(),
});

const workflowWorldEventRawConfigSchema = z
  .object({
    worldPatch: workflowWorldPatchSchema.optional(),
  })
  .passthrough();

const workflowWorldEventConfigSchema = z.object({
  eventType: z.string().trim().min(1).max(80).default('workflow.event'),
  payload: hiveJsonObjectSchema.default({}),
  world: hiveWorldSchema.optional(),
});

export type HiveWorkflowExecutionCapabilities = {
  createHiveWorldEvent: (
    payload: WorkflowCapabilityPayload
  ) => Promise<unknown>;
  createTradeOffer: (payload: WorkflowCapabilityPayload) => Promise<unknown>;
  createWarehouse: (payload: WorkflowCapabilityPayload) => Promise<unknown>;
  getSnapshot: (serverId: string) => Promise<unknown>;
  log?: (message: string) => void;
  persistNpcDecision: (payload: WorkflowCapabilityPayload) => Promise<unknown>;
  runAgentInteractions: (
    payload: WorkflowCapabilityPayload
  ) => Promise<unknown>;
  runFarmingAction: (payload: WorkflowCapabilityPayload) => Promise<unknown>;
  runSimulationTick: (serverId: string) => Promise<unknown>;
  runTradeAccept: (payload: WorkflowCapabilityPayload) => Promise<unknown>;
  transferInventory: (payload: WorkflowCapabilityPayload) => Promise<unknown>;
  updateNpc: (
    npcId: string,
    patch: Record<string, unknown>
  ) => Promise<unknown>;
};

export type HiveWorkflowExecutionInput = {
  actorUserId: string;
  capabilities: HiveWorkflowExecutionCapabilities;
  definition: HiveWorkflowDefinition;
  input?: Record<string, unknown>;
  serverId: string;
};

export type HiveWorkflowExecutionResult = {
  error?: string;
  output: Json;
  status: 'completed' | 'failed';
  trace: HiveWorkflowStepTrace[];
};

export { validateHiveWorkflowDefinition } from './workflow-validation';

function getPathValue(source: unknown, path: string[]) {
  let value = source;

  for (const part of path) {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }

  return value;
}

function resolveReference(reference: string, context: WorkflowContext) {
  const parts = reference
    .trim()
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts[0] === 'input') {
    return getPathValue(context.input, parts.slice(1));
  }

  if (parts[0] === 'steps') {
    const [nodeId, outputSegment, ...path] = parts.slice(1);
    if (!nodeId || outputSegment !== 'output') return undefined;
    return getPathValue(context.steps[nodeId]?.output, path);
  }

  return undefined;
}

function stringifyReferenceValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return JSON.stringify(value);
}

export function resolveHiveWorkflowValue(
  value: unknown,
  context: WorkflowContext
): unknown {
  if (typeof value === 'string') {
    const fullMatch = value.match(FULL_REFERENCE_PATTERN);
    if (fullMatch?.[1]) {
      return resolveReference(fullMatch[1], context) ?? '';
    }

    return value.replace(REFERENCE_PATTERN, (_match, reference: string) =>
      stringifyReferenceValue(resolveReference(reference, context))
    );
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveHiveWorkflowValue(entry, context));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        resolveHiveWorkflowValue(entry, context),
      ])
    );
  }

  return value;
}

function getConfig(node: HiveWorkflowNode, context: WorkflowContext) {
  return (resolveHiveWorkflowValue(node.data.config ?? {}, context) ??
    {}) as Record<string, unknown>;
}

function getIssuePath(issue: { path: PropertyKey[] }) {
  return issue.path.length > 0 ? issue.path.join('.') : 'config';
}

function parseNodeConfig<T>(
  schema: z.ZodType<T>,
  config: Record<string, unknown>,
  nodeType: HiveWorkflowNodeType
): T {
  const parsed = schema.safeParse(config);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .map((issue) => `${getIssuePath(issue)}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid Hive workflow ${nodeType} config: ${issues}`);
}

function compareCondition(config: Record<string, unknown>) {
  const operator =
    typeof config.operator === 'string' ? config.operator : 'truthy';
  const left = config.left;
  const right = config.right;

  switch (operator) {
    case 'contains':
      return String(left ?? '').includes(String(right ?? ''));
    case 'equals':
      return left === right;
    case 'exists':
      return left !== undefined && left !== null && left !== '';
    case 'greater_than':
      return Number(left) > Number(right);
    case 'less_than':
      return Number(left) < Number(right);
    case 'not_equals':
      return left !== right;
    default:
      return Boolean(left);
  }
}

async function executeNode(input: {
  actorUserId: string;
  capabilities: HiveWorkflowExecutionCapabilities;
  context: WorkflowContext;
  node: HiveWorkflowNode;
  serverId: string;
}) {
  const { capabilities, context, node, serverId } = input;
  const config = getConfig(node, context);

  switch (node.type) {
    case 'agent_interaction':
      return capabilities.runAgentInteractions(config);
    case 'condition': {
      const result = compareCondition(config);
      return { result };
    }
    case 'context':
      return capabilities.getSnapshot(serverId);
    case 'farming':
      return capabilities.runFarmingAction(
        parseNodeConfig(workflowFarmingConfigSchema, config, node.type)
      );
    case 'log': {
      const message =
        typeof config.message === 'string' ? config.message : node.data.label;
      capabilities.log?.(message);
      return { message };
    }
    case 'manual_trigger':
      return context.input;
    case 'npc_decision':
      return capabilities.persistNpcDecision(
        parseNodeConfig(workflowNpcDecisionConfigSchema, config, node.type)
      );
    case 'simulation_tick':
      return capabilities.runSimulationTick(serverId);
    case 'trade': {
      const parsed = parseNodeConfig(
        workflowTradeConfigSchema,
        config,
        node.type
      );
      return parsed.action === 'accept'
        ? capabilities.runTradeAccept(parsed)
        : capabilities.createTradeOffer(parsed);
    }
    case 'transform':
      return config.value ?? config;
    case 'update_npc': {
      const parsed = parseNodeConfig(
        workflowUpdateNpcConfigSchema,
        config,
        node.type
      );
      return capabilities.updateNpc(parsed.npcId, parsed.patch);
    }
    case 'warehouse': {
      const parsed = parseNodeConfig(
        workflowWarehouseConfigSchema,
        config,
        node.type
      );
      return parsed.action === 'transfer'
        ? capabilities.transferInventory(parsed)
        : capabilities.createWarehouse(parsed);
    }
    case 'world_event': {
      const rawConfig = parseNodeConfig(
        workflowWorldEventRawConfigSchema,
        config,
        node.type
      );
      const patchedConfig = await getHiveWorkflowWorldEventConfig({
        capabilities,
        config: rawConfig,
        serverId,
      });
      return capabilities.createHiveWorldEvent(
        parseNodeConfig(
          workflowWorldEventConfigSchema,
          patchedConfig,
          node.type
        )
      );
    }
    default:
      return assertNever(node.type);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Hive workflow node: ${value}`);
}

function isTruthyConditionOutput(output: unknown) {
  return (
    !!output &&
    typeof output === 'object' &&
    (output as { result?: unknown }).result === true
  );
}

function getRunnableEdges(
  node: HiveWorkflowNode,
  edges: HiveWorkflowEdge[],
  output: unknown
) {
  if (node.type !== 'condition') return edges;
  const handle = isTruthyConditionOutput(output) ? 'true' : 'false';
  return edges.filter((edge) => (edge.sourceHandle ?? handle) === handle);
}

function toJson(value: unknown): Json {
  return value === undefined ? null : (value as Json);
}

export async function executeHiveWorkflowDefinition({
  actorUserId,
  capabilities,
  definition,
  input = {},
  serverId,
}: HiveWorkflowExecutionInput): Promise<HiveWorkflowExecutionResult> {
  const validation = validateHiveWorkflowDefinition(definition);
  if (!validation.ok) {
    return {
      error: validation.errors.join(' '),
      output: {},
      status: 'failed',
      trace: [],
    };
  }

  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));
  const outgoing = groupHiveWorkflowEdgesBySource(definition.edges);
  const trigger = definition.nodes.find(
    (node) => node.type === 'manual_trigger'
  );
  const queue = trigger ? [trigger.id] : [];
  const visited = new Set<string>();
  const context: WorkflowContext = { input, steps: {} };
  const trace: HiveWorkflowStepTrace[] = [];
  let output: unknown = {};

  while (queue.length > 0) {
    if (trace.length >= MAX_WORKFLOW_STEPS) {
      return {
        error: `Hive workflow runs are limited to ${MAX_WORKFLOW_STEPS} steps.`,
        output: toJson(output),
        status: 'failed',
        trace,
      };
    }

    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeById.get(nodeId);
    if (!node) continue;

    const started = Date.now();
    try {
      const nodeOutput = await executeNode({
        actorUserId,
        capabilities,
        context,
        node,
        serverId,
      });
      output = nodeOutput;
      context.steps[node.id] = { output: nodeOutput };
      trace.push({
        durationMs: Date.now() - started,
        nodeId: node.id,
        nodeType: node.type as HiveWorkflowNodeType,
        output: toJson(nodeOutput),
        status: 'completed',
      });

      for (const edge of getRunnableEdges(
        node,
        outgoing.get(node.id) ?? [],
        nodeOutput
      )) {
        if (!visited.has(edge.target)) queue.push(edge.target);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      trace.push({
        durationMs: Date.now() - started,
        error: message,
        nodeId: node.id,
        nodeType: node.type as HiveWorkflowNodeType,
        status: 'failed',
      });
      return {
        error: message,
        output: toJson(output),
        status: 'failed',
        trace,
      };
    }
  }

  return {
    output: toJson(output),
    status: 'completed',
    trace,
  };
}
