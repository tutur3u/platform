import { FilePlus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { DocumentCard } from './card';
import MyDialogContent from './dialog-content';

export const metadata: Metadata = {
  title: 'Documents',
  description: 'Manage Documents in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function DocumentsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ workspace, wsId }) => {
        const documents = await getDocuments(wsId);

        const { withoutPermission } = await getPermissions({
          wsId,
        });

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
                    <Button className="gap-2">
                      <FilePlus className="h-4 w-4" />
                      {newDocumentLabel}
                    </Button>
                  </DialogTrigger>
                  <MyDialogContent wsId={wsId} />
                </Dialog>
              }
            />
            <Separator className="my-4" />

            {documents && documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
                <FilePlus className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="mb-2 font-medium text-foreground text-lg">
                  {noDocumentsLabel}
                </p>
                <p className="mb-6 max-w-sm text-muted-foreground text-sm">
                  {t('ws-documents.empty_state_description')}
                </p>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <FilePlus className="h-4 w-4" />
                      {newDocumentLabel}
                    </Button>
                  </DialogTrigger>
                  <MyDialogContent wsId={wsId} />
                </Dialog>
              </div>
            ) : (
              <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {workspace &&
                  documents?.map((doc) => (
                    <DocumentCard
                      key={`doc-${doc.id}`}
                      wsId={workspace.id}
                      document={doc}
                    />
                  ))}
              </div>
            )}
          </>
        );
      }}
    </WorkspaceWrapper>
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
