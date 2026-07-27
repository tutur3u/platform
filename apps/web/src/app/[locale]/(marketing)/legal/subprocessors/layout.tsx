import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  description:
    'The maintained registry of subprocessors that may support Tuturuuu services.',
  pathname: '/legal/subprocessors',
  title: 'Subprocessor Registry',
});

export default function SubprocessorsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
