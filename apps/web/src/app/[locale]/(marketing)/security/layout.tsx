import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Security and Data Protection',
  description:
    'Read about the Tuturuuu approach to security, compliance, and data protection.',
  pathname: '/security',
});

export default function SecurityLayout({ children }: { children: ReactNode }) {
  return children;
}
