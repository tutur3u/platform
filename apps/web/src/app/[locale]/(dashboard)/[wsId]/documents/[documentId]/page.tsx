import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceDocument } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { DocumentEditor } from './document-editor';

interface Props {
  params: Promise<{
    wsId: string;
    documentId: string;
  }>;
}

async function getDocument(
  wsId: string,
  docId: string
): Promise<Partial<WorkspaceDocument> | null> {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('workspace_documents')
    .select('*')
    .eq('id', docId)
    .eq('ws_id', wsId)
    .single();

  if (error) {
    console.error('Error fetching document:', error.message, error.code);
    return null;
  }

  return data;
}

export default async function DocumentDetailsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, documentId }) => {
        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;

        if (withoutPermission('manage_documents')) {
          redirect(`/${wsId}`);
        }

        const document = await getDocument(wsId, documentId);

        return (
          <DocumentEditor
            documentId={documentId}
            wsId={wsId}
            initialDocument={document}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
