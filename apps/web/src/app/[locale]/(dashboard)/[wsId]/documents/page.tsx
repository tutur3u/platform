import DocumentCard from '../../../../../components/document/DocumentCard';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@repo/ui/components/ui/button';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { FilePlus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function DocumentsPage({ params }: Props) {
  const { wsId } = await params;
  const ws = await getWorkspace(wsId);
  const documents = await getDocuments(wsId);

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_documents')) redirect(`/${wsId}`);

  const t = await getTranslations();

  const newDocumentLabel = t('documents.new-document');
  const noDocumentsLabel = t('documents.no-documents');
  // const createDocumentErrorLabel = t('create-document-error');
  // const createNewDocumentLabel = t('create-new-document');

  // async function createDocument({
  //   wsId,
  //   doc,
  // }: {
  //   wsId: string;
  //   doc: Partial<Document>;
  // }) {
  //   if (!ws) return;

  //   const res = await fetch(`/api/workspaces/${ws.id}/documents`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       name: doc.name,
  //     }),
  //   });

  //   if (!res.ok) {
  // showNotification({
  //   title: 'Error',
  //   message: createDocumentErrorLabel,
  //   color: 'red',
  // });
  //     return;
  //   }

  //   const { id } = await res.json();
  //   redirect(`/${wsId}/documents/${id}`);
  // }

  // function showDocumentEditForm() {
  // openModal({
  //   title: <div className="font-semibold">{createNewDocumentLabel}</div>,
  //   centered: true,
  //   children: (
  //     <DocumentEditForm
  //       onSubmit={(doc) => createDocument({ wsId: ws?.id, doc })}
  //     />
  //   ),
  // });
  // }

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-documents.plural')}
        singularTitle={t('ws-documents.singular')}
        description={t('ws-documents.description')}
        createTitle={t('ws-documents.create')}
        createDescription={t('ws-documents.create_description')}
        action={
          <Button
          // onClick={showDocumentEditForm}
          >
            <FilePlus className="mr-2 h-4 w-4" />
            {newDocumentLabel}
          </Button>
        }
      />
      <Separator className="my-4" />

      <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {documents && documents.length === 0 && (
          <div className="text-foreground/80 col-span-full">
            {noDocumentsLabel}
          </div>
        )}

        {ws &&
          documents &&
          documents?.map((doc) => (
            <DocumentCard key={`doc-${doc.id}`} wsId={ws?.id} document={doc} />
          ))}
      </div>
    </>
  );
}

async function getDocuments(wsId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('workspace_documents')
    .select('id, name, content, created_at')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  return data;
}
