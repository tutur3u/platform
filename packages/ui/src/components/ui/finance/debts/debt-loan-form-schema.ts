import * as z from 'zod';

export type DebtLoanValidationKey =
  | 'amount_positive'
  | 'counterparty_too_long'
  | 'description_too_long'
  | 'name_required'
  | 'start_date_required';

export function createDebtLoanFormSchema(
  t: (key: DebtLoanValidationKey) => string
) {
  return z.object({
    counterparty: z.string().max(255, t('counterparty_too_long')).optional(),
    currency: z.string(),
    description: z.string().max(500, t('description_too_long')).optional(),
    due_date: z.string().optional(),
    interest_rate: z.number().min(0).max(100).optional(),
    interest_type: z.enum(['simple', 'compound']).optional(),
    name: z.string().min(1, t('name_required')).max(255),
    principal_amount: z.number().min(1, t('amount_positive')),
    start_date: z.string().min(1, t('start_date_required')),
    type: z.enum(['debt', 'loan']),
    wallet_id: z.string().optional(),
  });
}

export type DebtLoanFormValues = z.infer<
  ReturnType<typeof createDebtLoanFormSchema>
>;
