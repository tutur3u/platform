import { z } from 'zod';

export const publicCatalogueFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  creatorId: z.guid().optional(),
  search: z.string().max(200).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
});
