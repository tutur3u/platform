import * as z from 'zod';

export const TransactionFormSchema = z
  .object({
    id: z.string().optional(),
    description: z.string().optional(),
    amount: z.number().positive(),
    origin_wallet_id: z.string().min(1),
    destination_wallet_id: z.string().optional(),
    destination_amount: z.number().positive().optional(),
    category_id: z.string().optional(),
    taken_at: z.date(),
    report_opt_in: z.boolean(),
    tag_ids: z.array(z.string()).optional(),
    is_transfer: z.boolean().optional(),
    is_amount_confidential: z.boolean().optional(),
    is_description_confidential: z.boolean().optional(),
    is_category_confidential: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.is_transfer && (!data.category_id || data.category_id === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Category is required',
        path: ['category_id'],
      });
    }

    if (data.is_transfer) {
      if (!data.destination_wallet_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Destination wallet is required',
          path: ['destination_wallet_id'],
        });
      }

      if (data.origin_wallet_id === data.destination_wallet_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Source and destination wallets must be different',
          path: ['destination_wallet_id'],
        });
      }
    }
  });

export type TransactionFormValues = z.infer<typeof TransactionFormSchema>;

export function roundTransferAmount(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
