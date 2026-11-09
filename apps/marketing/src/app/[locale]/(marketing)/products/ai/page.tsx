import {
  Bot,
  Layers,
  Sparkles,
  Video,
  Wand2,
  Waypoints,
  Zap,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'ai',
  accent: 'purple',
  icon: Sparkles,
  primaryHref: '/onboarding',
  features: [
    { key: 'mira', icon: Bot },
    { key: 'aurora', icon: Waypoints },
    { key: 'rewise', icon: Layers },
    { key: 'nova', icon: Wand2 },
    { key: 'crystal', icon: Video },
    { key: 'everywhere', icon: Zap },
  ],
  useCases: [
    { key: 'planning', itemCount: 4 },
    { key: 'inbox', itemCount: 4 },
    { key: 'knowledge', itemCount: 4 },
  ],
};

export default function AIProductPage() {
  return <ProductPage config={config} />;
}
