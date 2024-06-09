import DocumentCard from '../../../../../components/document/DocumentCard';
import { Separator } from '@/components/ui/separator';
import { getWorkspace } from '@/lib/workspace-helper';
import { Document } from '@/types/primitives/Document';
import { DocumentPlusIcon } from '@heroicons/react/24/solid';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import useTranslation from 'next-translate/useTranslation';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({ params: { wsId } }: Props) {
  const ws = await getWorkspace(wsId);
  const documents = await getDocuments(wsId);

  const { t } = useTranslation('documents');

  const newDocumentLabel = t('new-document');
  const noDocumentsLabel = t('no-documents');
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
      <div className="flex flex-col items-center gap-4 md:flex-row">
        <button
          // onClick={showDocumentEditForm}
          className="flex flex-none items-center gap-1 rounded bg-blue-500/10 p-4 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:bg-blue-300/20 dark:text-blue-300 dark:hover:bg-blue-300/10"
        >
          {newDocumentLabel} <DocumentPlusIcon className="h-4 w-4" />
        </button>
      </div>

      <Separator className="my-4" />

      <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {documents && documents.length === 0 && (
          <div className="text-foreground/80 col-span-full">
            {noDocumentsLabel}
          </div>
        )}

        {ws &&
          documents &&
          documents?.map((doc: Document) => (
            <DocumentCard key={`doc-${doc.id}`} wsId={ws?.id} document={doc} />
          ))}
      </div>
    </>
  );
}

async function getDocuments(wsId: string) {
  const supabase = createServerComponentClient({ cookies });

  const { data } = await supabase
    .from('workspace_documents')
    .select('id, name, content, created_at')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  return data;
}
