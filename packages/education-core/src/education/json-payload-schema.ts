import type { Json } from '@tuturuuu/types';
import { z } from 'zod';

export const JsonPayloadSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonPayloadSchema),
    z.record(z.string(), JsonPayloadSchema),
  ])
);
