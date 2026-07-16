import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return children;
}
