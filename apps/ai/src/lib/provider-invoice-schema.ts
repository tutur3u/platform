import { z } from 'zod';

export const providerInvoiceSchema = z
  .object({
    provider: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    accountId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    reference: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    issuedOn: z.iso.date(),
    reviewedOn: z.iso.date(),
    amountUsd: z.number().finite().min(0).max(999_999_999),
    currency: z.literal('USD'),
    status: z.literal('paid'),
    source: z.literal('reviewed_provider_invoice'),
  })
  .strict()
  .refine((value) => value.issuedOn <= value.reviewedOn);
