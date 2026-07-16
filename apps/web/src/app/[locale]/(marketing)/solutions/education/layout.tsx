import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Education Solution',
  description:
    'Empower classrooms and campuses with the Tuturuuu education suite.',
  pathname: '/solutions/education',
});

export default function EducationLayout({ children }: { children: ReactNode }) {
  return children;
}
