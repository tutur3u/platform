import type { Product } from '@tuturuuu/payment/polar';
import { getSupportedProductPrice } from '@tuturuuu/payment-core/polar-price';
import { getVersionedWorkspaceProductPrices } from '@tuturuuu/payment-core/public-prices';
import { isSelfServeWorkspaceProduct } from '@tuturuuu/payment-core/self-serve-products';

export function getPlanListOptions(products: Product[]) {
  // Helper to simplify plan names (remove "Tuturuuu Workspace" prefix and billing cycle suffix)
  const getSimplePlanName = (name: string): string => {
    return name
      .replace(/^Tuturuuu\s+Workspace\s+/i, '')
      .replace(/^Tuturuuu\s+/i, '')
      .replace(/\s+(Monthly|Yearly|Annual)$/i, '')
      .trim();
  };

  return products
    .map((product) => {
      let supported: ReturnType<typeof getSupportedProductPrice>;
      let versioned: ReturnType<typeof getVersionedWorkspaceProductPrices>;
      try {
        versioned = getVersionedWorkspaceProductPrices(product);
        supported = versioned?.usd ?? getSupportedProductPrice(product);
      } catch {
        return null;
      }
      const firstPrice = supported.price;
      const isFreeModel = product.metadata.product_tier === 'FREE';
      if (
        !isSelfServeWorkspaceProduct({
          id: product.id,
          price_per_seat: supported.pricePerSeat,
          recurring_interval: product.recurringInterval,
          tier:
            typeof product.metadata.product_tier === 'string'
              ? product.metadata.product_tier
              : null,
          pricing_model: firstPrice.amountType,
          archived: product.isArchived,
          price: supported.amount,
        })
      )
        return null;
      const price = supported.amount;
      const pricePerSeat = supported.pricePerSeat;
      const minSeats = supported.minSeats;
      const maxSeats = supported.maxSeats;

      return {
        id: product.id,
        name: getSimplePlanName(product.name),
        fullName: product.name,
        price,
        billingCycle: product.recurringInterval,
        features: product.benefits
          ? product.benefits
              .map((benefit) =>
                'description' in benefit ? (benefit.description as string) : ''
              )
              .filter(Boolean)
          : [],
        isEnterprise: product.metadata.product_tier === 'ENTERPRISE',
        isPro: product.metadata.product_tier === 'PRO',
        isPlus: product.metadata.product_tier === 'PLUS',
        isFree: product.metadata.product_tier === 'FREE',
        // Seat-based pricing fields
        pricingModel: isFreeModel
          ? 'free'
          : (firstPrice?.amountType ?? 'custom'),
        pricePerSeat,
        vndPricePerSeat: versioned?.offer.vndUnitAmount ?? null,
        minSeats,
        maxSeats,
      };
    })
    .filter((plan) => plan !== null)
    .sort((a, b) => {
      if (a.isFree) return -1;
      if (b.isFree) return 1;

      if (a.pricingModel === 'seat_based' && b.pricingModel === 'seat_based')
        return (a.pricePerSeat ?? 0) - (b.pricePerSeat ?? 0);

      return (a.price ?? 0) - (b.price ?? 0);
    });
}
