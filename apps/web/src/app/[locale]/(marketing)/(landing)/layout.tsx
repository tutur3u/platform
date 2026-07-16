import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'AI-Powered Workspace for Teams',
  description:
    "Discover Tuturuuu's AI-powered workspace for you, your team, and everyone.",
  pathname: '/',
});

export default function LandingLayout({ children }: { children: ReactNode }) {
  return children;
}
