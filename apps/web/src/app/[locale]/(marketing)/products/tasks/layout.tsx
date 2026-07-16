import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Project and Task Management',
  description:
    'Keep projects on track with Tuturuuu Tasks and collaborative boards.',
  pathname: '/products/tasks',
});

export default function TasksLayout({ children }: { children: ReactNode }) {
  return children;
}
