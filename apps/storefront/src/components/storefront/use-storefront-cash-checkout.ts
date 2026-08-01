'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getInventoryStaffCheckoutOptions,
  type InventoryPublicStorefrontResponse,
} from '@tuturuuu/internal-api/inventory';
import { useState } from 'react';

export function useStorefrontCashCheckout({
  initialCashOnly,
  isDemoStorefront,
  storefront,
  storeSlug,
}: {
  initialCashOnly: boolean;
  isDemoStorefront: boolean;
  storefront: InventoryPublicStorefrontResponse['storefront'] | undefined;
  storeSlug: string;
}) {
  const [checkoutMethod, setCheckoutMethod] = useState<'cash' | 'configured'>(
    initialCashOnly ? 'cash' : 'configured'
  );
  const [cashWalletId, setCashWalletId] = useState('');
  const [cashCategoryId, setCashCategoryId] = useState('');
  const optionsQuery = useQuery({
    enabled: Boolean(
      storefront &&
        !isDemoStorefront &&
        ['cash', 'polar', 'square_pos', 'square_terminal'].includes(
          storefront.checkoutMode
        )
    ),
    queryFn: () => getInventoryStaffCheckoutOptions(storeSlug),
    queryKey: ['storefront', storeSlug, 'staff-checkout-options'],
    retry: false,
    staleTime: 15_000,
  });
  const walletId =
    cashWalletId ||
    optionsQuery.data?.cash?.defaultWalletId ||
    (optionsQuery.data?.cash?.wallets.length === 1
      ? optionsQuery.data.cash.wallets[0]?.id
      : '') ||
    '';
  const categoryId =
    cashCategoryId ||
    optionsQuery.data?.cash?.defaultCategoryId ||
    (optionsQuery.data?.cash?.categories.length === 1
      ? optionsQuery.data.cash.categories[0]?.id
      : '') ||
    '';
  const cashOnly = storefront?.checkoutMode === 'cash';

  return {
    cashOnly,
    categoryId,
    checkoutMethod,
    isCashCheckout: cashOnly || checkoutMethod === 'cash',
    optionsQuery,
    setCashCategoryId,
    setCashWalletId,
    setCheckoutMethod,
    walletId,
  };
}
