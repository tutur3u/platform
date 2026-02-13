import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

export default async function InfrastructureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;
  if (withoutPermission('view_infrastructure')) notFound();
  return children;
}
