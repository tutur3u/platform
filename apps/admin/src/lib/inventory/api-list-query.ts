import {
  MAX_MEDIUM_TEXT_LENGTH,
  MAX_SEARCH_LENGTH,
} from '@tuturuuu/utils/constants';
import { z } from 'zod';

export const InventoryApiListQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).default(''),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_MEDIUM_TEXT_LENGTH)
    .default(10),
  response: z.enum(['paginated']).optional(),
});

export type InventoryApiListQuery = z.infer<typeof InventoryApiListQuerySchema>;

export function parseInventoryApiListQuery(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawParams: Record<string, string | string[]> = {};

  searchParams.forEach((value, key) => {
    rawParams[key] = value;
  });

  return InventoryApiListQuerySchema.safeParse(rawParams);
}

export function getInventoryApiListRange({
  page,
  pageSize,
}: Pick<InventoryApiListQuery, 'page' | 'pageSize'>) {
  const start = (page - 1) * pageSize;
  return {
    end: start + pageSize - 1,
    start,
  };
}

export function shouldReturnPaginatedInventoryList(request: Request) {
  return new URL(request.url).searchParams.get('response') === 'paginated';
}
