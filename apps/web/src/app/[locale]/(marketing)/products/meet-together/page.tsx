import {
  CalendarRange,
  ClipboardList,
  Globe,
  LayoutGrid,
  Share2,
  UserPlus,
  Users,
} from '@tuturuuu/icons/lucide';
import type { Metadata } from 'next';
import {
  ProductPage,
  type ProductPageConfig,
} from '../product-page-primitives';

export const metadata: Metadata = {
  title: 'Meet Together Product',
  description:
    'Find a time that works for everyone, then plan the agenda in the same place — with Tuturuuu Meet Together.',
};

const config: ProductPageConfig = {
  slug: 'meet',
  accent: 'purple',
  icon: Users,
  primaryHref: '/meet-together',
  features: [
    { key: 'availability', icon: CalendarRange },
    { key: 'overlap', icon: LayoutGrid },
    { key: 'timezones', icon: Globe },
    { key: 'guests', icon: UserPlus },
    { key: 'agenda', icon: ClipboardList },
    { key: 'sharing', icon: Share2 },
  ],
  useCases: [
    { key: 'teams', itemCount: 4 },
    { key: 'groups', itemCount: 4 },
    { key: 'clients', itemCount: 4 },
  ],
};

export default function MeetTogetherProductPage() {
  return <ProductPage config={config} />;
}
