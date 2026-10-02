import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'marketingSeo.solutions_education',
  pathname: '/solutions/education',
});

export default function EducationLayout({ children }: { children: ReactNode }) {
  return children;
}
