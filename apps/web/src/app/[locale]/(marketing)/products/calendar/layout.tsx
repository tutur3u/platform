import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.calendar.seo',
  pathname: '/products/calendar',
});

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return children;
}
