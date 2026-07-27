import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  description:
    'Tuturuuu Data Processing Addendum covering instructions, safeguards, subprocessors, transfers, incidents, audits, and deletion.',
  pathname: '/legal/dpa',
  title: 'Data Processing Addendum',
});

export default function DpaLayout({ children }: { children: ReactNode }) {
  return children;
}
