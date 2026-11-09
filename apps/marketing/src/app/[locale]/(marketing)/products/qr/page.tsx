import {
  Download,
  Globe,
  ImagePlus,
  LayoutTemplate,
  Link,
  Palette,
  QrCode,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'qr',
  accent: 'blue',
  icon: QrCode,
  primaryHref: 'https://tools.tuturuuu.com/qr',
  primaryExternal: true,
  features: [
    { key: 'anyValue', icon: Link },
    { key: 'styles', icon: LayoutTemplate },
    { key: 'colors', icon: Palette },
    { key: 'logo', icon: ImagePlus },
    { key: 'export', icon: Download },
    { key: 'open', icon: Globe },
  ],
  useCases: [
    { key: 'business', itemCount: 4 },
    { key: 'events', itemCount: 4 },
    { key: 'everyday', itemCount: 4 },
  ],
};

export default function QrProductPage() {
  return <ProductPage config={config} />;
}
