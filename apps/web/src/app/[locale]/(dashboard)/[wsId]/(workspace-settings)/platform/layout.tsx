import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

export default async function InfrastructureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { withoutPermission } = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
  });
  if (withoutPermission('view_infrastructure')) notFound();
  return children;
}
