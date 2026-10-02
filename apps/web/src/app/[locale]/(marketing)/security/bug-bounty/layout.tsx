import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.security_bug_bounty',
  pathname: '/security/bug-bounty',
});

export default function BugBountyLayout({ children }: { children: ReactNode }) {
  return children;
}
