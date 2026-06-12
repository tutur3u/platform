'use client';

import { useEffect, useState } from 'react';

export type CartLine = {
  listingId: string;
  quantity: number;
};

function cartKey(storeSlug: string) {
  return `storefront-cart:${storeSlug}`;
}

export function useCart(storeSlug: string) {
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    try {
      setCart(JSON.parse(localStorage.getItem(cartKey(storeSlug)) ?? '[]'));
    } catch {
      setCart([]);
    }
  }, [storeSlug]);

  useEffect(() => {
    localStorage.setItem(cartKey(storeSlug), JSON.stringify(cart));
  }, [cart, storeSlug]);

  return {
    cart,
    clear: () => setCart([]),
    decrement: (listingId: string) =>
      setCart((current) =>
        current
          .map((line) =>
            line.listingId === listingId
              ? { ...line, quantity: line.quantity - 1 }
              : line
          )
          .filter((line) => line.quantity > 0)
      ),
    increment: (listingId: string, maxQuantity = Number.POSITIVE_INFINITY) =>
      setCart((current) => {
        const existing = current.find((line) => line.listingId === listingId);
        if (!existing) return [...current, { listingId, quantity: 1 }];
        return current.map((line) =>
          line.listingId === listingId
            ? { ...line, quantity: Math.min(line.quantity + 1, maxQuantity) }
            : line
        );
      }),
  };
}
