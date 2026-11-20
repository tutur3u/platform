import type { SettlementTransfer } from '@tuturuuu/finance-core/bill-splitting';
import { z } from 'zod';

export const statusLinkScope = z.object({
  wsId: z.uuid(),
  splitId: z.uuid(),
  creatorId: z.uuid(),
  participantId: z.uuid().nullable(),
  publicName: z.string().max(80).nullable(),
  receivingParticipantId: z.uuid().nullable().optional(),
  receivingContactId: z.uuid().nullable().optional(),
});

export const statusCurrency = z.object({
  code: z.string().regex(/^[A-Z]{3}$/),
  minorDigits: z.int().min(0).max(4),
});

export function projectSettlementStatus(
  scope: { participantId: string | null; publicName: string | null },
  currency: z.infer<typeof statusCurrency>,
  transfers: readonly SettlementTransfer[]
) {
  const participantId = scope.participantId;
  const visible = participantId
    ? transfers.filter(
        (transfer) =>
          transfer.from === participantId || transfer.to === participantId
      )
    : transfers;

  const common = {
    status: visible.length ? 'outstanding' : 'settled',
    remainingTransfers: visible.length,
    currency,
  };
  if (!participantId) return common;

  let toPay = 0n;
  let toReceive = 0n;
  for (const transfer of visible) {
    if (transfer.from === participantId) toPay += BigInt(transfer.amountMinor);
    if (transfer.to === participantId)
      toReceive += BigInt(transfer.amountMinor);
  }
  return {
    ...common,
    ...(scope.publicName ? { name: scope.publicName } : {}),
    toPayMinor: toPay.toString(),
    toReceiveMinor: toReceive.toString(),
  };
}
