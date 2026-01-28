'use client';

import { useMemo } from 'react';
import type { SelectedProductItem } from '../types';

export function useInvoiceSubtotal(selectedProducts: SelectedProductItem[]) {
  return useMemo(() => {
    return selectedProducts.reduce(
      (total, item) => total + item.inventory.price * item.quantity,
      0
    );
  }, [selectedProducts]);
}
