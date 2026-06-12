import { NextResponse } from 'next/server';
import { z } from 'zod';

const blankToUndefined = (value: unknown) =>
  value === '' || value === null ? undefined : value;

const optionalNumber = z.preprocess(
  blankToUndefined,
  z.coerce.number().optional()
);
const optionalPositiveNumber = z.preprocess(
  blankToUndefined,
  z.coerce.number().positive().optional()
);
const optionalDayOfMonth = z.preprocess(
  blankToUndefined,
  z.coerce.number().int().min(1).max(31).optional()
);

export const walletPayloadSchema = z
  .object({
    balance: optionalNumber,
    currency: z.string().min(1).optional(),
    description: z.string().max(500).nullable().optional(),
    icon: z.string().nullable().optional(),
    id: z.guid().optional(),
    image_src: z.string().nullable().optional(),
    limit: optionalPositiveNumber,
    name: z.string().max(255).optional(),
    payment_date: optionalDayOfMonth,
    report_opt_in: z.boolean().optional(),
    statement_date: optionalDayOfMonth,
    type: z.enum(['STANDARD', 'CREDIT']).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'CREDIT') return;

    if (data.limit === undefined || data.limit <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Credit limit must be greater than zero',
        path: ['limit'],
      });
    }

    if (data.statement_date === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Statement date is required for credit wallets',
        path: ['statement_date'],
      });
    }

    if (data.payment_date === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Payment date is required for credit wallets',
        path: ['payment_date'],
      });
    }
  });

export type WalletPayload = z.infer<typeof walletPayloadSchema>;

export async function parseWalletPayload(req: Request): Promise<
  | {
      data: WalletPayload;
      response?: never;
    }
  | {
      data?: never;
      response: NextResponse;
    }
> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return {
      response: NextResponse.json(
        { message: 'Malformed JSON request body' },
        { status: 400 }
      ),
    };
  }

  const parsed = walletPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { message: 'Invalid wallet data', errors: parsed.error.issues },
        { status: 400 }
      ),
    };
  }

  return { data: parsed.data };
}
