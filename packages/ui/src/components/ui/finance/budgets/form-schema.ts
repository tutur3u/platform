import * as z from 'zod';

export const NO_CATEGORY_VALUE = '__all_categories__';
export const NO_WALLET_VALUE = '__all_wallets__';

export const budgetFormSchemaShape = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  amount: z.string().min(1),
  period: z.enum(['monthly', 'yearly', 'custom']),
  start_date: z.string().min(1),
  end_date: z.string().optional(),
  alert_threshold: z.string().optional(),
  category_id: z.string().optional(),
  wallet_id: z.string().optional(),
});

export type BudgetFormValues = z.infer<typeof budgetFormSchemaShape>;

type BudgetValidationKey =
  | 'amount_required'
  | 'name_required'
  | 'start_date_required';

export function createBudgetFormSchema(
  t: (key: BudgetValidationKey) => string
) {
  return z.object({
    name: z.string().min(1, t('name_required')),
    description: z.string().optional(),
    amount: z.string().min(1, t('amount_required')),
    period: z.enum(['monthly', 'yearly', 'custom']),
    start_date: z.string().min(1, t('start_date_required')),
    end_date: z.string().optional(),
    alert_threshold: z.string().optional(),
    category_id: z.string().optional(),
    wallet_id: z.string().optional(),
  });
}
