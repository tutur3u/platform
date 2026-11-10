import {
  Bell,
  Calendar,
  Globe,
  Link2,
  Smartphone,
  Timer,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

const config: ProductPageConfig = {
  slug: 'calendar',
  accent: 'blue',
  icon: Calendar,
  primaryHref: 'https://calendar.tuturuuu.com',
  primaryExternal: true,
  features: [
    { key: 'scheduling', icon: Timer },
    { key: 'coordination', icon: Users },
    { key: 'timezones', icon: Globe },
    { key: 'booking', icon: Link2 },
    { key: 'reminders', icon: Bell },
    { key: 'anywhere', icon: Smartphone },
  ],
  useCases: [
    { key: 'team', itemCount: 4 },
    { key: 'clients', itemCount: 4 },
    { key: 'events', itemCount: 4 },
  ],
};

export default function CalendarProductPage() {
  return <ProductPage config={config} />;
}
