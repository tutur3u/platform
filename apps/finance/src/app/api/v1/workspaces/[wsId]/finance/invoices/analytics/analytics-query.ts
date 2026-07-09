import { z } from 'zod';

import type { WeekStartsOn } from './analytics-types';

const dateSchema = z.union([
  z.iso.datetime({ offset: true }),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
]);

const granularitySchema = z.enum(['daily', 'weekly', 'monthly']);

const weekStartsOnSchema = z
  .number()
  .int()
  .min(0)
  .max(6)
  .transform((value) => value as WeekStartsOn);

const analyticsQuerySchema = z.object({
  walletIds: z.array(z.string().min(1)).default([]),
  userIds: z.array(z.string().min(1)).default([]),
  start: dateSchema.optional(),
  end: dateSchema.optional(),
  granularity: granularitySchema.optional(),
  weekStartsOn: weekStartsOnSchema.default(1),
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const parseAnalyticsQuery = (searchParams: URLSearchParams) => {
  const weekStartsOnRaw = searchParams.get('weekStartsOn');
  const weekStartsOn =
    weekStartsOnRaw === null ? undefined : Number(weekStartsOnRaw);

  return analyticsQuerySchema.safeParse({
    walletIds: searchParams.getAll('walletIds'),
    userIds: searchParams.getAll('userIds'),
    start: searchParams.get('start') ?? undefined,
    end: searchParams.get('end') ?? undefined,
    granularity: searchParams.get('granularity') ?? undefined,
    weekStartsOn,
  });
};
