import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Bug Bounty Program',
  description:
    'Report potential vulnerabilities through the Tuturuuu responsible disclosure program.',
  pathname: '/security/bug-bounty',
});

export default function BugBountyLayout({ children }: { children: ReactNode }) {
  return children;
}
