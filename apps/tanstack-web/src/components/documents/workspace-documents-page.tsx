'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus } from '@tuturuuu/icons';
import {
  type ListWorkspaceDocumentsResponse,
  listAllWorkspaceDocuments,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'use-intl';
import { CreateWorkspaceDocumentDialog } from './create-workspace-document-dialog';
import { WorkspaceDocumentCard } from './workspace-document-card';

type WorkspaceDocumentsPageProps = {
  initialDocuments: ListWorkspaceDocumentsResponse;
  locale: string;
  routeWorkspaceId: string;
  workspaceId: string;
};

export function WorkspaceDocumentsPage({
  initialDocuments,
  locale,
  routeWorkspaceId,
  workspaceId,
}: WorkspaceDocumentsPageProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const queryKey = ['workspace-documents', workspaceId] as const;
  const documentsQuery = useQuery({
    initialData: initialDocuments,
    queryFn: () => listAllWorkspaceDocuments(workspaceId),
    queryKey,
  });

  const refreshDocuments = async () => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const documents = documentsQuery.data.data;
  const newDocumentLabel = t('documents.new-document');
  const renderCreateAction = () => (
    <CreateWorkspaceDocumentDialog
      locale={locale}
      onCreated={refreshDocuments}
      routeWorkspaceId={routeWorkspaceId}
      workspaceId={workspaceId}
    >
      <Button className="gap-2">
        <FilePlus className="h-4 w-4" />
        {newDocumentLabel}
      </Button>
    </CreateWorkspaceDocumentDialog>
  );

  return (
    <>
      <FeatureSummary
        action={renderCreateAction()}
        createDescription={t('ws-documents.create_description')}
        createTitle={t('ws-documents.create')}
        description={t('ws-documents.description')}
        pluralTitle={t('ws-documents.plural')}
        singularTitle={t('ws-documents.singular')}
      />
      <Separator className="my-4" />

      {documentsQuery.isError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-destructive text-sm">
          {documentsQuery.error instanceof Error
            ? documentsQuery.error.message
            : t('common.error')}
        </div>
      ) : null}

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FilePlus className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="mb-2 font-medium text-foreground text-lg">
            {t('documents.no-documents')}
          </p>
          <p className="mb-6 max-w-sm text-muted-foreground text-sm">
            {t('ws-documents.empty_state_description')}
          </p>
          {renderCreateAction()}
        </div>
      ) : (
        <div className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {documents.map((document) => (
            <WorkspaceDocumentCard
              document={document}
              key={document.id}
              locale={locale}
              onDeleted={refreshDocuments}
              routeWorkspaceId={routeWorkspaceId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </>
  );
}
