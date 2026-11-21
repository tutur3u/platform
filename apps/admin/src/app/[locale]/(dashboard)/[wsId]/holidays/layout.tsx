import type { ReactNode } from 'react';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';

interface Props {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function HolidaysLayout({ children, params }: Props) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  return <>{children}</>;
}
