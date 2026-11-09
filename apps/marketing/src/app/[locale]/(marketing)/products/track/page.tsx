import {
  Coffee,
  Download,
  History,
  ListChecks,
  Play,
  Timer,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'track',
  accent: 'orange',
  icon: Timer,
  primaryHref: 'https://track.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'timer', icon: Play },
    { key: 'tasks', icon: ListChecks },
    { key: 'breaks', icon: Coffee },
    { key: 'history', icon: History },
    { key: 'team', icon: Users },
    { key: 'export', icon: Download },
  ],
  useCases: [
    { key: 'freelance', itemCount: 4 },
    { key: 'team', itemCount: 4 },
    { key: 'review', itemCount: 4 },
  ],
};

export default function TrackProductPage() {
  return <ProductPage config={config} />;
}
