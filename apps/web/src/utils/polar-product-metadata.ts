import type { Product } from '@tuturuuu/payment/polar';
import type { WorkspaceProductTier } from '@tuturuuu/types';

const VALID_TIERS: WorkspaceProductTier[] = [
  'FREE',
  'PLUS',
  'PRO',
  'ENTERPRISE',
];

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = Math.trunc(value);
    return parsed > 0 ? parsed : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function parseWorkspaceProductTier(
  metadata: Product['metadata']
): WorkspaceProductTier | null {
  const tierRaw = metadata?.product_tier;

  if (typeof tierRaw !== 'string') {
    return null;
  }

  const tierValue = tierRaw.trim().toUpperCase();
  return VALID_TIERS.includes(tierValue as WorkspaceProductTier)
    ? (tierValue as WorkspaceProductTier)
    : null;
}

export function isAiCreditPackProduct(metadata: Product['metadata']): boolean {
  const productType = metadata?.product_type;
  return (
    typeof productType === 'string' &&
    productType.trim().toLowerCase() === 'ai_credit_pack'
  );
}

export function parseCreditPackTokens(
  metadata: Product['metadata']
): number | null {
  return parsePositiveInteger(metadata?.tokens);
}
