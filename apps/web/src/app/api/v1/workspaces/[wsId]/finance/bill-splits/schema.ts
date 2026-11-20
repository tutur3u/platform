import { z } from 'zod';

export const billSplitId = z.uuid().transform((id) => id.toLowerCase());

const minor = z.int().nonnegative();
const positive = z.int().positive();
const displayName = z.string().trim().min(1).max(120);
const currency = z.strictObject({
  code: z.string().regex(/^[A-Z]{3}$/),
  minorDigits: z.int().min(0).max(4),
});
const share = z.strictObject({
  participantId: billSplitId,
  amountMinor: minor,
});
const allocation = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('equal'),
    participantIds: z.array(billSplitId).min(1).max(100),
  }),
  z.strictObject({
    kind: z.literal('percentage'),
    shares: z
      .array(
        z.strictObject({
          participantId: billSplitId,
          basisPoints: z.int().min(0).max(10000),
        })
      )
      .min(1)
      .max(100),
  }),
  z.strictObject({
    kind: z.literal('exact'),
    shares: z.array(share).min(1).max(100),
  }),
]);
const sponsorship = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('full'),
    sponsorId: billSplitId,
    beneficiaryId: billSplitId,
  }),
  z.strictObject({
    kind: z.literal('partial'),
    sponsorId: billSplitId,
    beneficiaryId: billSplitId,
    amountMinor: positive,
  }),
]);
const expense = z.strictObject({
  label: displayName,
  currency,
  exchangeRate: z
    .strictObject({
      numerator: positive,
      denominator: positive,
    })
    .optional(),
  attendeeIds: z.array(billSplitId).min(1).max(100),
  lines: z
    .array(
      z.strictObject({
        label: displayName,
        amountMinor: minor,
        allocation,
      })
    )
    .min(1)
    .max(100),
  adjustments: z
    .array(
      z.strictObject({
        kind: z.enum(['tax', 'tip', 'discount']),
        amountMinor: minor,
        allocation: allocation.optional(),
      })
    )
    .max(100)
    .optional(),
  sponsorships: z.array(sponsorship).max(100).optional(),
  payments: z.array(share).min(1).max(100),
});
const participant = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('contact'),
    id: billSplitId,
    contactId: billSplitId,
    displayName,
  }),
  z.strictObject({
    kind: z.literal('member'),
    id: billSplitId,
    memberId: billSplitId,
    displayName,
  }),
]);
export const directTransfer = z.strictObject({
  from: billSplitId,
  to: billSplitId,
  amountMinor: positive,
});

export const createBillSplit = z.strictObject({
  id: billSplitId,
  title: displayName,
  currency,
  participants: z.array(participant).min(1).max(100),
  expenses: z.array(expense).min(1).max(100),
  direct: z.array(directTransfer).max(200).optional(),
  finalized: z.boolean(),
});

export const billSplitActivity = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('comment'),
    eventId: billSplitId,
    comment: z.string().trim().min(1).max(2000),
  }),
  z.strictObject({
    kind: z.literal('payment_report'),
    eventId: billSplitId,
    from: billSplitId,
    to: billSplitId,
    amountMinor: positive,
  }),
  z.strictObject({
    kind: z.literal('payment_confirm'),
    eventId: billSplitId,
    reportId: billSplitId,
  }),
]);

export const storedSettlement = z.object({
  ledger: z.object({
    balances: z.array(
      z.object({ participantId: billSplitId, amountMinor: z.int() })
    ),
  }),
  input: z.object({ direct: z.array(directTransfer) }),
});

export const confirmedPayments = z.array(directTransfer);
