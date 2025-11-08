import type { ReactNode } from 'react';
import SelectGroupGateway from './select-group-gateway';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    groupId: string;
  }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId, groupId } = await params;

  if (groupId === '~') {
    return <SelectGroupGateway wsId={wsId} />;
  }

  return children;
}
