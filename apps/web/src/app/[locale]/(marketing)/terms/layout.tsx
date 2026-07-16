import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Terms of Service',
  description:
    'Terms of Service for Tuturuuu JSC — an open-source AI-powered productivity platform incorporated in Vietnam.',
  pathname: '/terms',
});

export default function TermsLayout({ children }: { children: ReactNode }) {
  return children;
}
