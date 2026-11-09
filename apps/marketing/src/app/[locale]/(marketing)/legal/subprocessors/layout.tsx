import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.legal_subprocessors',
  pathname: '/legal/subprocessors',
});

export default function SubprocessorsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
