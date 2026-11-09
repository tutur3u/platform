import { getFeatureFlag } from '@tuturuuu/utils/feature-flags/core';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { DocumentHierarchy } from './hierarchy/document-hierarchy';

export default function DocumentsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({ wsId });
        if (
          !permissions ||
          permissions.withoutPermission('manage_documents') ||
          !(await getFeatureFlag(wsId, 'ENABLE_DOCUMENT_HIERARCHY'))
        )
          return children;
        return (
          <DocumentHierarchy wsId={wsId} canManage>
            {children}
          </DocumentHierarchy>
        );
      }}
    </WorkspaceWrapper>
  );
}
