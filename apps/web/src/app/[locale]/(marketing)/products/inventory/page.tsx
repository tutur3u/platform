import {
  BarChart3,
  Box,
  Boxes,
  Building2,
  QrCode,
  RefreshCw,
  Warehouse,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'inventory',
  accent: 'green',
  icon: Warehouse,
  primaryHref: 'https://inventory.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'stock', icon: Boxes },
    { key: 'orders', icon: Box },
    { key: 'scanning', icon: QrCode },
    { key: 'warehouses', icon: Building2 },
    { key: 'reports', icon: BarChart3 },
    { key: 'reordering', icon: RefreshCw },
  ],
  useCases: [
    { key: 'retail', itemCount: 4 },
    { key: 'distribution', itemCount: 4 },
    { key: 'manufacturing', itemCount: 4 },
  ],
};

export default function InventoryProductPage() {
  return <ProductPage config={config} />;
}
