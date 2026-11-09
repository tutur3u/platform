import {
  BarChart3,
  HeartHandshake,
  MessageSquare,
  Settings,
  Tag,
  Target,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'crm',
  accent: 'blue',
  icon: HeartHandshake,
  primaryHref: 'https://contacts.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'contacts', icon: Users },
    { key: 'pipeline', icon: Target },
    { key: 'history', icon: MessageSquare },
    { key: 'deals', icon: Tag },
    { key: 'analytics', icon: BarChart3 },
    { key: 'automation', icon: Settings },
  ],
  useCases: [
    { key: 'sales', itemCount: 4 },
    { key: 'service', itemCount: 4 },
    { key: 'growth', itemCount: 4 },
  ],
};

export default function CRMProductPage() {
  return <ProductPage config={config} />;
}
