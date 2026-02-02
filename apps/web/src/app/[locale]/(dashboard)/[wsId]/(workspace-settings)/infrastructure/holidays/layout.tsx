import { enforceRootWorkspaceAdmin } from '@tuturuuu/utils/workspace-helper';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function HolidaysLayout({ children, params }: Props) {
  const { wsId } = await params;
  await enforceRootWorkspaceAdmin(wsId, {
    redirectTo: `/${wsId}/settings`,
  });

  return <>{children}</>;
}
