import { z } from 'zod';
import { orgTextAllowed, orgTextDenied, singleScript } from './org-text';

export { orgTextDenied };

// Stable join ID, not a confidentiality control: roleKey is public.
// Publisher: first 16 bytes of HMAC-SHA256(secret, role key), lowercase hex.
export const orgKeySchema = z
  .string()
  .length(32)
  .regex(/^[a-f0-9]{32}$/);
// Every org text field rejects (never strips or rewrites) invisible, control,
// separator and non-NFC/NFKC-stable input, so the stored value is what renders.
const boundedText = (max: number) =>
  z.string().min(1).max(max).refine(orgTextAllowed);
const cleanText = (max: number) =>
  boundedText(max).refine((value) => !orgTextDenied(value));
// Identifier-like fields also refuse letters mixed from several scripts.
const identText = (max: number) => cleanText(max).refine(singleScript);
export const orgStatusSchema = z.enum([
  'working',
  'waiting',
  'idle',
  'blocked',
]);
export const orgActivitySchema = z.enum(['now', 'lt1h', 'today', 'earlier']);
export const orgEdgeKindSchema = z.enum([
  'reports_to',
  'delegates_to',
  'reviews',
]);
export const orgAreaSchema = z.enum([
  'ec',
  'meet',
  'mobile',
  'security',
  'release',
  'platform',
]);
const orgNodeFields = {
  key: orgKeySchema,
  label: identText(80),
  role: identText(80),
  area: orgAreaSchema.optional(),
  team: identText(64).optional(),
  pool: identText(64).optional(),
  modelFamily: identText(80).optional(),
  status: orgStatusSchema,
  activity: orgActivitySchema,
  taskTitle: boundedText(80)
    .nullable()
    .optional()
    .transform((value) =>
      value != null && orgTextDenied(value) ? null : value
    ),
  prRefs: z
    .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .max(10)
    .optional(),
};
const orgNodeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...orgNodeFields,
    kind: z.literal('agent'),
    roleKey: cleanText(64)
      .regex(/^[a-z0-9-]{1,64}$/)
      .optional(),
  }),
  z.strictObject({ ...orgNodeFields, kind: z.literal('lane') }),
]);
export const orgSchema = z
  .strictObject({
    nodes: z.array(orgNodeSchema).max(100),
    edges: z
      .array(
        z.strictObject({
          from: orgKeySchema,
          to: orgKeySchema,
          kind: orgEdgeKindSchema,
        })
      )
      .max(400),
  })
  .refine((org) => {
    const keys = new Set(org.nodes.map((node) => node.key));
    const edges = new Set(
      org.edges.map((edge) => `${edge.from}:${edge.to}:${edge.kind}`)
    );
    return (
      keys.size === org.nodes.length &&
      edges.size === org.edges.length &&
      org.edges.every(
        (edge) =>
          edge.from !== edge.to && keys.has(edge.from) && keys.has(edge.to)
      )
    );
  });
export type Org = z.infer<typeof orgSchema>;
