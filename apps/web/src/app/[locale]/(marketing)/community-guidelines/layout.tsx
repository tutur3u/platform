import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Community Guidelines',
  description:
    'Community Guidelines for Tuturuuu JSC — standards of behavior and expectations for our open-source community.',
};

export default function CommunityGuidelinesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
