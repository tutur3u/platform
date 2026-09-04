import type { ReactNode } from 'react';
import { createLocalizedMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createLocalizedMarketingMetadata({
  namespace: 'products.drive.seo',
  pathname: '/products/drive',
});

export default function DriveLayout({ children }: { children: ReactNode }) {
  return children;
}
