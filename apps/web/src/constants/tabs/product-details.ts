import { NavTabs } from '../../types/Tab';

export const productDetailsTabs: NavTabs = {
  namespace: 'product-details-tabs',
  tabs: [
    {
      name: 'information',
      href: '/[wsId]/inventory/products/[productId]',
    },
    {
      name: 'origin',
      href: '/[wsId]/inventory/products/[productId]/origin',
      disabled: true,
    },
  ],
};
