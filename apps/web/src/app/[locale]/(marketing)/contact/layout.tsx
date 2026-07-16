import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Contact Us',
  description:
    'Reach out to the Tuturuuu team for support, partnerships, or general questions.',
  pathname: '/contact',
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
