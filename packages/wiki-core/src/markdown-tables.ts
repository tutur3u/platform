import { z } from 'zod';

export const markdownTableCellAttrs = z.strictObject({
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  colspan: z.number().int().min(1).max(30).optional(),
  rowspan: z.number().int().min(1).max(30).optional(),
});

export const markdownTableData = z
  .array(
    z
      .array(
        z.strictObject({
          type: z.enum(['tableCell', 'tableHeader']),
          attrs: markdownTableCellAttrs.optional(),
          body: z.string().optional(),
        })
      )
      .min(1)
  )
  .min(1);
