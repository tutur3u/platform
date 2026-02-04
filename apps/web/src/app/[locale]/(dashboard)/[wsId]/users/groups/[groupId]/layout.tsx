import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { ReactNode } from 'react';
import { verifyGroupAccess } from '../utils';
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

  const { containsPermission } = await getPermissions({ wsId });
  const hasManageUsersPermission = containsPermission('manage_users');

  if (!hasManageUsersPermission) {
    await verifyGroupAccess(wsId, groupId);
  }

  return children;
}
