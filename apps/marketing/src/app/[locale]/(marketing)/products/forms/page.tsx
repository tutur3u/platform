import {
  ChartColumn,
  ClipboardList,
  Inbox,
  Palette,
  Share2,
  Split,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'forms',
  accent: 'purple',
  icon: ClipboardList,
  primaryHref: 'https://forms.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'builder', icon: ClipboardList },
    { key: 'logic', icon: Split },
    { key: 'theme', icon: Palette },
    { key: 'share', icon: Share2 },
    { key: 'responses', icon: Inbox },
    { key: 'analytics', icon: ChartColumn },
  ],
  useCases: [
    { key: 'intake', itemCount: 4 },
    { key: 'feedback', itemCount: 4 },
    { key: 'internal', itemCount: 4 },
  ],
};

export default function FormsProductPage() {
  return <ProductPage config={config} />;
}
