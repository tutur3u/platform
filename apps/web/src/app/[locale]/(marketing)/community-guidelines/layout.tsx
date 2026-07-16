import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Community Guidelines',
  description:
    'Community Guidelines for Tuturuuu JSC — standards of behavior and expectations for our open-source community.',
  pathname: '/community-guidelines',
});

export default function CommunityGuidelinesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
