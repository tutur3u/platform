import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

export default function InfrastructureLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { withoutPermission } = await getPermissions({ wsId });
        if (withoutPermission('view_infrastructure')) notFound();
        return children;
      }}
    </WorkspaceWrapper>
  );
}
