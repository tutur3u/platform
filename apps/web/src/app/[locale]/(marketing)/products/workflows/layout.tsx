import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Workflow Automation',
  description: 'Automate cross-team processes with Tuturuuu Workflows.',
  pathname: '/products/workflows',
});

export default function WorkflowsLayout({ children }: { children: ReactNode }) {
  return children;
}
