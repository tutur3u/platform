import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.acceptable_use',
  pathname: '/acceptable-use',
});

export default function AcceptableUseLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
