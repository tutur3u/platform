import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Shared Team Calendar',
  description:
    'Coordinate schedules with the shared Tuturuuu calendar experience.',
  pathname: '/products/calendar',
});

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return children;
}
