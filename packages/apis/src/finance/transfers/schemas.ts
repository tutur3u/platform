import { z } from 'zod';

export const TransferSchema = z
  .object({
    client_origin_transaction_id: z.guid().optional(),
    client_destination_transaction_id: z.guid().optional(),
    origin_wallet_id: z.guid(),
    destination_wallet_id: z.guid(),
    amount: z.number().positive(),
    destination_amount: z.number().positive().optional(),
    description: z.string().optional(),
    taken_at: z.union([z.string(), z.date()]),
    report_opt_in: z.boolean().optional(),
    tag_ids: z.array(z.guid()).optional(),
  })
  .refine((data) => data.origin_wallet_id !== data.destination_wallet_id, {
    message: 'Source and destination wallets must be different',
    path: ['destination_wallet_id'],
  })
  .refine(
    (data) =>
      Boolean(data.client_origin_transaction_id) ===
      Boolean(data.client_destination_transaction_id),
    { message: 'Both client transaction IDs are required together' }
  );

export const UpdateTransferSchema = z
  .object({
    origin_transaction_id: z.guid(),
    destination_transaction_id: z.guid(),
    origin_wallet_id: z.guid(),
    destination_wallet_id: z.guid(),
    amount: z.number().positive(),
    destination_amount: z.number().positive().optional(),
    description: z.string().optional(),
    taken_at: z.union([z.string(), z.date()]),
    report_opt_in: z.boolean().optional(),
    tag_ids: z.array(z.guid()).optional(),
  })
  .refine(
    (data) => data.origin_transaction_id !== data.destination_transaction_id,
    {
      message: 'Source and destination transactions must be different',
      path: ['destination_transaction_id'],
    }
  )
  .refine((data) => data.origin_wallet_id !== data.destination_wallet_id, {
    message: 'Source and destination wallets must be different',
    path: ['destination_wallet_id'],
  });

export const MigrateTransferSchema = UpdateTransferSchema;
