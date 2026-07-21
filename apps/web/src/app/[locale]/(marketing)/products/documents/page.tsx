import {
  FileSearch,
  FileText,
  History,
  KeyRound,
  PenLine,
  Sparkles,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'documents',
  accent: 'orange',
  icon: FileText,
  primaryHref: '/onboarding',
  features: [
    { key: 'editor', icon: PenLine },
    { key: 'collaboration', icon: Users },
    { key: 'search', icon: FileSearch },
    { key: 'assistant', icon: Sparkles },
    { key: 'versions', icon: History },
    { key: 'permissions', icon: KeyRound },
  ],
  useCases: [
    { key: 'specs', itemCount: 4 },
    { key: 'knowledge', itemCount: 4 },
    { key: 'business', itemCount: 4 },
  ],
};

export default function DocumentsProductPage() {
  return <ProductPage config={config} />;
}
