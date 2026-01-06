import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import WorkspaceWrapper from '@/components/workspace-wrapper';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function WhiteboardsLayout({
  params,
  children,
}: LayoutProps) {
  return (
    <WorkspaceWrapper params={params}>
      {({ workspace }) => {
        if (!workspace.tier || workspace.tier === 'FREE') return notFound();

        return children;
      }}
    </WorkspaceWrapper>
  );
}
