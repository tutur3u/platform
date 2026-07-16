import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Privacy Policy',
  description:
    'Privacy Policy for Tuturuuu JSC — how we collect, process, and protect your data as an open-source platform.',
  pathname: '/privacy',
});

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
