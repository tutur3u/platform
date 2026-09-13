import type { Product } from '@tuturuuu/payment/polar';

/** The current billing table represents one USD price per product. */
export function getSupportedProductPrice(product: Product, requireUsd = true) {
  // Legacy free-product webhook payloads predate the SDK's fixed-zero representation.
  const supported: Array<
    | Product['prices'][number]
    | { id: string; amountType: 'free'; isArchived: boolean }
  > = product.prices;
  const prices = supported.filter((price) => !price.isArchived);
  if (prices.length !== 1) {
    throw new Error(`Product ${product.id} requires exactly one active price`);
  }
  const price = prices[0];
  if (!price) throw new Error(`Product ${product.id} has no active price`);
  if (
    requireUsd &&
    'priceCurrency' in price &&
    price.priceCurrency.toLowerCase() !== 'usd'
  ) {
    throw new Error(`Product ${product.id} requires USD billing table support`);
  }
  if (price.amountType === 'fixed') {
    if (!Number.isSafeInteger(price.priceAmount) || price.priceAmount < 0) {
      throw new Error(`Product ${product.id} has an invalid fixed amount`);
    }
    return {
      price,
      amount: price.priceAmount,
      pricePerSeat: null,
      minSeats: null,
      maxSeats: null,
    };
  }
  if (price.amountType === 'free') {
    return {
      price,
      amount: 0,
      pricePerSeat: null,
      minSeats: null,
      maxSeats: null,
    };
  }
  if (price.amountType === 'seat_based') {
    const tiers = price.seatTiers.tiers;
    const tier = tiers[0];
    if (
      tiers.length !== 1 ||
      !tier ||
      !Number.isSafeInteger(tier.pricePerSeat) ||
      tier.pricePerSeat < 0
    ) {
      throw new Error(
        `Product ${product.id} cannot map graduated or invalid seat pricing to a single seat price`
      );
    }
    return {
      price,
      amount: null,
      pricePerSeat: tier.pricePerSeat,
      minSeats: price.seatTiers.minimumSeats,
      maxSeats: price.seatTiers.maximumSeats,
    };
  }
  throw new Error(
    `Product ${product.id} uses unsupported ${price.amountType} pricing`
  );
}
