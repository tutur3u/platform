import type { ReactNode } from 'react';
import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Secure Cloud Drive',
  description: 'Store, organize, and securely share files with Tuturuuu Drive.',
  pathname: '/products/drive',
});

export default function DriveLayout({ children }: { children: ReactNode }) {
  return children;
}
