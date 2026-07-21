import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { FormStudio } from '@/features/forms/form-studio';
import {
  fetchFormDefinition,
  getFormAnalytics,
  listFormResponses,
} from '@/features/forms/server';
import { getFormsPageContext } from '@/lib/forms-permissions';

interface PageProps {
  params: Promise<{ wsId: string; formId: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    responsesPage?: string;
    responsesPageSize?: string;
  }>;
}

export default async function FormDetailPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <WorkspaceWrapper params={Promise.resolve(resolvedParams)}>
      {async ({ wsId }) => {
        const context = await getFormsPageContext(wsId);

        if (!context) {
          notFound();
        }

        const { adminClient, canManageForms, canViewAnalytics } = context;

        if (!canManageForms && !canViewAnalytics) {
          notFound();
        }

        const form = await fetchFormDefinition(
          adminClient,
          resolvedParams.formId
        );

        if (!form || form.wsId !== wsId) {
          notFound();
        }

        const responsesPage = Number(
          resolvedSearchParams.responsesPage ?? resolvedSearchParams.page ?? '1'
        );
        const responsesPageSize = Number(
          resolvedSearchParams.responsesPageSize ??
            resolvedSearchParams.pageSize ??
            '10'
        );

        const [responses, analytics] = await Promise.all([
          listFormResponses(adminClient, form, {
            query: resolvedSearchParams.q,
            page: responsesPage,
            pageSize: responsesPageSize,
          }),
          getFormAnalytics(adminClient, form),
        ]);

        return (
          <FormStudio
            wsId={wsId}
            workspaceSlug={resolvedParams.wsId}
            mode="edit"
            canManageForms={!!canManageForms}
            initialForm={form}
            initialResponses={responses.records}
            initialResponsesPage={responsesPage}
            initialResponsesPageSize={responsesPageSize}
            initialResponsesTotal={responses.total}
            initialResponsesSummary={responses.summary}
            initialQuestionAnalytics={responses.questionAnalytics}
            initialAnalytics={analytics}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
