import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.community_guidelines',
  pathname: '/community-guidelines',
});

export default function CommunityGuidelinesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
