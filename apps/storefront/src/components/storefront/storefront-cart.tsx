'use client';

import { useCallback, useEffect, useState } from 'react';

export type CartLine = {
  listingId: string;
  variantId?: string | null;
  quantity: number;
};

function cartKey(storeSlug: string) {
  return `storefront-cart:${storeSlug}`;
}

function lineKey(listingId: string, variantId?: string | null) {
  return `${listingId}::${variantId ?? ''}`;
}

function readCart(storeSlug: string): CartLine[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(cartKey(storeSlug)) ?? '[]'
    ) as CartLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Variant-aware cart persisted per storefront in localStorage. Cart entries are
 * keyed by listing + variant so the same listing can hold multiple SKUs. A
 * `storage` listener keeps the cart in sync across tabs/components so the badge,
 * product dialog, and cart view all reflect a single source of truth.
 */
export function useCart(storeSlug: string) {
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    setCart(readCart(storeSlug));
    const onStorage = (event: StorageEvent) => {
      if (event.key === cartKey(storeSlug)) setCart(readCart(storeSlug));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storeSlug]);

  useEffect(() => {
    localStorage.setItem(cartKey(storeSlug), JSON.stringify(cart));
  }, [cart, storeSlug]);

  const clear = useCallback(() => setCart([]), []);

  const decrement = useCallback(
    (listingId: string, variantId?: string | null) =>
      setCart((current) =>
        current
          .map((line) =>
            lineKey(line.listingId, line.variantId) ===
            lineKey(listingId, variantId)
              ? { ...line, quantity: line.quantity - 1 }
              : line
          )
          .filter((line) => line.quantity > 0)
      ),
    []
  );

  const increment = useCallback(
    (
      listingId: string,
      maxQuantity = Number.POSITIVE_INFINITY,
      variantId?: string | null
    ) =>
      setCart((current) => {
        const key = lineKey(listingId, variantId);
        const existing = current.find(
          (line) => lineKey(line.listingId, line.variantId) === key
        );
        if (!existing) {
          return [
            ...current,
            { listingId, quantity: 1, variantId: variantId ?? null },
          ];
        }
        return current.map((line) =>
          lineKey(line.listingId, line.variantId) === key
            ? { ...line, quantity: Math.min(line.quantity + 1, maxQuantity) }
            : line
        );
      }),
    []
  );

  return { cart, clear, decrement, increment };
}
