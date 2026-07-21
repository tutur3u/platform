import {
  Boxes,
  CreditCard,
  Eye,
  Package,
  ReceiptText,
  ShoppingCart,
  Store,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'storefront',
  accent: 'green',
  icon: Store,
  primaryHref: 'https://storefront.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'catalog', icon: Package },
    { key: 'stock', icon: Boxes },
    { key: 'cart', icon: ShoppingCart },
    { key: 'checkout', icon: CreditCard },
    { key: 'orders', icon: ReceiptText },
    { key: 'visibility', icon: Eye },
  ],
  useCases: [
    { key: 'shops', itemCount: 4 },
    { key: 'operators', itemCount: 4 },
    { key: 'buyers', itemCount: 4 },
  ],
};

export default function StorefrontProductPage() {
  return <ProductPage config={config} />;
}
