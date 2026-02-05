import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
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
  const { wsId: id, groupId } = await params;
  const wsId = await normalizeWorkspaceId(id);

  if (groupId === '~') {
    return <SelectGroupGateway wsId={wsId} />;
  }

  const { containsPermission } = await getPermissions({ wsId });
  const hasManageUsersPermission = containsPermission('manage_users');
  console.log('User has manage_users permission?', hasManageUsersPermission);

  if (!hasManageUsersPermission) {
    console.log(
      'Verifying group access for user without manage_users permission'
    );
    await verifyGroupAccess(wsId, groupId);
  }

  return children;
}
