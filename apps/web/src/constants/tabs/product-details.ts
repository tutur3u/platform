import { NavTabs } from '../../types/Tab';

export const productDetailsTabs: NavTabs = {
  namespace: 'product-details-tabs',
  tabs: [
    {
      name: 'Thông tin',
      href: '/[wsId]/inventory/products/[productId]',
    },
    {
      name: 'Nguồn gốc',
      href: '/[wsId]/inventory/products/[productId]/origin',
    },
  ],
};
