import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.contact',
  pathname: '/contact',
});

export default function ContactLayout({ children }: { children: ReactNode }) {
  return children;
}
