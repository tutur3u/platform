import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Bug Bounty Program',
  description:
    'Report potential vulnerabilities through the Tuturuuu responsible disclosure program.',
};

export default function BugBountyLayout({ children }: { children: ReactNode }) {
  return children;
}
