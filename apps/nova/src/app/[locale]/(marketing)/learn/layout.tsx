import { Card } from '@tuturuuu/ui/card';
import type { ReactNode } from 'react';
import { createNovaPageMetadata } from '@/lib/page-metadata';

export const generateMetadata = createNovaPageMetadata({
  title: 'Free Prompt Engineering Lessons',
  description:
    'Learn large language model fundamentals, prompting techniques, best practices, and advanced prompt engineering strategies.',
  pathname: '/learn',
});

export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container mx-auto p-6">
      <Card className="p-6">{children}</Card>
    </div>
  );
}
