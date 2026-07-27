import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  description:
    'Tuturuuu service-level definitions, exclusions, incident handling, and enterprise credit mechanics.',
  pathname: '/legal/sla',
  title: 'Service Level Agreement',
});

export default function SlaLayout({ children }: { children: ReactNode }) {
  return children;
}
