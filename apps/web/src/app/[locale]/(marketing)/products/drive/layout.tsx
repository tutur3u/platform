import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Drive Product',
  description: 'Store, organize, and securely share files with Tuturuuu Drive.',
};

export default function DriveLayout({ children }: { children: ReactNode }) {
  return children;
}
