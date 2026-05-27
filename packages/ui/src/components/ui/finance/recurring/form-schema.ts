import * as z from 'zod';

export const NO_CATEGORY_VALUE = '__no_category__';

export type RecurringValidationKey =
  | 'amount_invalid'
  | 'amount_required'
  | 'name_required'
  | 'start_date_required'
  | 'wallet_required';

export function createRecurringFormSchema(
  t: (key: RecurringValidationKey) => string
) {
  return z.object({
    amount: z
      .string()
      .min(1, t('amount_required'))
      .refine((value) => Number.isFinite(Number(value)), t('amount_invalid')),
    category_id: z.string().optional(),
    description: z.string().optional(),
    end_date: z.string().optional(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    name: z.string().min(1, t('name_required')),
    start_date: z.string().min(1, t('start_date_required')),
    wallet_id: z.string().min(1, t('wallet_required')),
  });
}

export type RecurringFormValues = z.infer<
  ReturnType<typeof createRecurringFormSchema>
>;
