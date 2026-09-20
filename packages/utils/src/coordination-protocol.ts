import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const base = {
  key: digest,
  owner: z.string().uuid(),
};
export const coordinationRequestSchema = z.union([
  z
    .object({
      ...base,
      namespace: z.literal('authenticator'),
      action: z.literal('acquire'),
    })
    .strict(),
  z
    .object({
      ...base,
      namespace: z.literal('meeting'),
      action: z.literal('acquire'),
      fingerprint: digest,
    })
    .strict(),
  z
    .object({
      ...base,
      namespace: z.enum(['authenticator', 'meeting']),
      action: z.enum(['check', 'release']),
    })
    .strict(),
  z
    .object({
      ...base,
      namespace: z.literal('meeting'),
      action: z.literal('complete'),
    })
    .strict(),
]);
export type CoordinationRequest = z.infer<typeof coordinationRequestSchema>;
export const coordinationResultSchema = z.union([
  z
    .object({
      outcome: z.literal('acquired'),
      fresh: z.boolean(),
      completed: z.boolean(),
    })
    .strict(),
  z
    .object({
      outcome: z.enum([
        'busy',
        'conflict',
        'owned',
        'lost',
        'released',
        'completed',
      ]),
    })
    .strict(),
]);
export type CoordinationResult = z.infer<typeof coordinationResultSchema>;
