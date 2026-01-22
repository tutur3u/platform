import * as z from 'zod';

export const viewingWindowOptions = [
  { value: '1_day', labelKey: 'ws-roles.viewing_window_1_day' },
  { value: '3_days', labelKey: 'ws-roles.viewing_window_3_days' },
  { value: '7_days', labelKey: 'ws-roles.viewing_window_7_days' },
  { value: '2_weeks', labelKey: 'ws-roles.viewing_window_2_weeks' },
  { value: '1_month', labelKey: 'ws-roles.viewing_window_1_month' },
  { value: '1_quarter', labelKey: 'ws-roles.viewing_window_1_quarter' },
  { value: '1_year', labelKey: 'ws-roles.viewing_window_1_year' },
  { value: 'custom', labelKey: 'ws-roles.viewing_window_custom' },
] as const;

export const viewingWindowEnum = z.enum([
  '1_day',
  '3_days',
  '7_days',
  '2_weeks',
  '1_month',
  '1_quarter',
  '1_year',
  'custom',
]);

export const viewingWindowBaseSchema = z
  .object({
    viewing_window: viewingWindowEnum,
    custom_days: z.number().int().min(1).max(365).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.viewing_window === 'custom') {
      if (data.custom_days === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['custom_days'],
          message: 'Custom days is required when using a custom window',
        });
      } else if (data.custom_days < 1 || data.custom_days > 365) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['custom_days'],
          message: 'Custom days must be between 1 and 365',
        });
      }
    } else if (data.custom_days !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['custom_days'],
        message: 'Custom days must be empty unless using a custom window',
      });
    }
  });

export const walletFormSchema = viewingWindowBaseSchema.extend({
  wallet_id: z.string().min(1, 'Wallet is required'),
});

export const roleFormSchema = viewingWindowBaseSchema.extend({
  role_id: z.string().min(1, 'Role is required'),
});

export type WalletFormValues = z.infer<typeof walletFormSchema>;
export type RoleFormValues = z.infer<typeof roleFormSchema>;
