import { z } from 'zod';

const horizonValues = [
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

const nodeTypeValues = [
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

const nodeStatusValues = [
  'backlog',
  'planned',
  'in_progress',
  'in_review',
  'blocked',
  'completed',
  'deferred',
  'cancelled',
] as const;

const edgeTypeValues = [
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

export const MindHorizonSchema = z.enum(horizonValues);
export const MindNodeTypeSchema = z.enum(nodeTypeValues);
export const MindNodeStatusSchema = z.enum(nodeStatusValues);
export const MindEdgeTypeSchema = z.enum(edgeTypeValues);

const JsonObjectSchema = z.record(z.string(), z.unknown());
const OptionalJsonObjectSchema = JsonObjectSchema.optional();
const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u)
  .nullable()
  .optional();

export const CreateMindBoardSchema = z.object({
  defaultHorizon: MindHorizonSchema.optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  title: z.string().trim().min(1).max(160),
});

export const UpdateMindBoardSchema = CreateMindBoardSchema.partial().extend({
  canvasView: JsonObjectSchema.nullable().optional(),
  settings: OptionalJsonObjectSchema,
  status: z.enum(['active', 'archived']).optional(),
});

export const SaveMindNodeSchema = z.object({
  body: z.string().max(20000).nullable().optional(),
  color: HexColorSchema,
  height: z.number().positive().optional(),
  horizon: MindHorizonSchema.optional(),
  id: z.guid(),
  metadata: OptionalJsonObjectSchema,
  nodeType: MindNodeTypeSchema.optional(),
  parentNodeId: z.guid().nullable().optional(),
  positionX: z.number(),
  positionY: z.number(),
  status: MindNodeStatusSchema.optional(),
  title: z.string().trim().min(1).max(240),
  width: z.number().positive().optional(),
});

export const SaveMindEdgeSchema = z.object({
  color: HexColorSchema,
  edgeType: MindEdgeTypeSchema.optional(),
  id: z.guid(),
  label: z.string().trim().max(240).nullable().optional(),
  metadata: OptionalJsonObjectSchema,
  sourceNodeId: z.guid(),
  targetNodeId: z.guid(),
  weight: z.number().nonnegative().optional(),
});

export const SaveMindGraphSchema = z.object({
  deletedEdgeIds: z.array(z.guid()).max(1000).optional(),
  deletedNodeIds: z.array(z.guid()).max(1000).optional(),
  edges: z.array(SaveMindEdgeSchema).max(5000),
  nodes: z.array(SaveMindNodeSchema).max(5000),
});

export type CreateMindBoardInput = z.infer<typeof CreateMindBoardSchema>;
export type SaveMindGraphInput = z.infer<typeof SaveMindGraphSchema>;
export type UpdateMindBoardInput = z.infer<typeof UpdateMindBoardSchema>;
