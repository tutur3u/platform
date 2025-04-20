import { DocumentCard } from './card';
import MyDialogContent from './dialog-content';
import { getPermissions, getWorkspace } from '@/lib/workspace-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import { FilePlus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function DocumentsPage({ params }: Props) {
  const { wsId } = await params;
  const ws = await getWorkspace(wsId);
  const documents = await getDocuments(wsId);

  const { withoutPermission } = await getPermissions({ wsId });

  if (withoutPermission('manage_documents')) redirect(`/${wsId}`);

  const t = await getTranslations();

  const newDocumentLabel = t('documents.new-document');
  const noDocumentsLabel = t('documents.no-documents');

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-documents.plural')}
        singularTitle={t('ws-documents.singular')}
        description={t('ws-documents.description')}
        createTitle={t('ws-documents.create')}
        createDescription={t('ws-documents.create_description')}
        action={
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <FilePlus className="mr-2 h-4 w-4" />
                {newDocumentLabel}
              </Button>
            </DialogTrigger>
            <MyDialogContent wsId={wsId} />
          </Dialog>
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
    .select('id, name, created_at')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  return data;
}
