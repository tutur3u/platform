import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export default async function LinkShortenerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        if (
          wsId !== ROOT_WORKSPACE_ID &&
          !(await verifySecret({
            forceAdmin: true,
            wsId: wsId,
            name: 'ENABLE_LINK_SHORTENER',
            value: 'true',
          }))
        )
          return notFound();
        return children;
      }}
    </WorkspaceWrapper>
  );
}
