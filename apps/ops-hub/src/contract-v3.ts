import { z } from 'zod';
import { SECURITY, UNSAFE } from './fields';

// Publisher: first 16 bytes of HMAC-SHA256(secret, role key), lowercase hex.
export const orgKeySchema = z
  .string()
  .length(32)
  .regex(/^[a-f0-9]{32}$/);
const ORG_UNSAFE =
  /(?:^|\s)(?:\/[\w.-]+|[a-z]:\\|\.\.?\/)|\b(?:feature|feat|fix|bugfix|hotfix|release|chore|docs|refactor|perf|claude)\/|\b(?:thread|run|session)[-_:][a-z0-9_-]+|\b(?:ignore (?:all |previous )?instructions|system prompt|you are (?:an? |the )|assistant:|<\/?(?:system|prompt)>|customer|khách hàng)\b|\b(?:Nguyễn Văn An|Trần Thị Bình|Lê Minh Châu)\b/iu;
export function orgTextDenied(value: string) {
  return UNSAFE.test(value) || SECURITY.test(value) || ORG_UNSAFE.test(value);
}
const boundedText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) =>
      [...value].every((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
    );
const cleanText = (max: number) =>
  boundedText(max).refine((value) => !orgTextDenied(value));
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
export const orgSchema = z
  .strictObject({
    nodes: z
      .array(
        z.strictObject({
          key: orgKeySchema,
          kind: z.enum(['agent', 'lane']),
          label: cleanText(80),
          role: cleanText(80),
          team: cleanText(64).optional(),
          pool: cleanText(64).optional(),
          modelFamily: cleanText(80).optional(),
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
        })
      )
      .max(100),
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
