/**
 * Response shape for a subscription plan-change proration preview.
 * Shared between the payment API route that computes it and the billing UI
 * that renders it, so both frontends and the pay backend agree on the type.
 */
export interface ProrationPreview {
  currentPlan: {
    id: string;
    name: string;
    price: number;
    billingCycle: string;
    remainingValue: number;
    pricingModel: 'fixed' | 'seat_based';
    seatCount?: number;
    pricePerSeat?: number;
  };
  newPlan: {
    id: string;
    name: string;
    price: number;
    billingCycle: string;
    proratedCharge: number;
    pricingModel: 'fixed' | 'seat_based';
    seatCount?: number;
    pricePerSeat?: number;
  };
  netAmount: number; // Positive = charge, Negative = credit
  daysRemaining: number;
  totalDaysInPeriod: number;
  isUpgrade: boolean;
  nextBillingDate: string;
  billingCycleChanged: boolean; // true when switching between monthly/yearly
}

/** Tier changes follow capabilities; same-tier changes compare full cycle charges. */
export function isPlanUpgrade(
  current: { tier: string | null; amount: number },
  target: { tier: string | null; amount: number }
): boolean {
  const tiers = ['FREE', 'PLUS', 'PRO', 'ENTERPRISE'];
  const before = tiers.indexOf(current.tier ?? '');
  const after = tiers.indexOf(target.tier ?? '');
  return before >= 0 && after >= 0 && before !== after
    ? after > before
    : target.amount > current.amount;
}
