import type { ReactNode } from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function WhiteboardsLayout({ children }: LayoutProps) {
  return children;
}
