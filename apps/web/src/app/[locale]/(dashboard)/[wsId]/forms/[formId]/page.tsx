import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { FormStudio } from '@/features/forms/form-studio';
import {
  fetchFormDefinition,
  getFormAnalytics,
  listFormResponses,
} from '@/features/forms/server';

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
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <WorkspaceWrapper params={Promise.resolve(resolvedParams)}>
      {async ({ wsId }) => {
        const supabase = await createClient();
        const adminClient = await createAdminClient();
        const { user } = await resolveAuthenticatedSessionUser(supabase);

        if (!user) {
          notFound();
        }

        const [{ data: canManageForms }, { data: canViewAnalytics }] =
          await Promise.all([
            supabase.rpc('has_workspace_permission', {
              p_user_id: user.id,
              p_ws_id: wsId,
              p_permission: 'manage_forms',
            }),
            supabase.rpc('has_workspace_permission', {
              p_user_id: user.id,
              p_ws_id: wsId,
              p_permission: 'view_form_analytics',
            }),
          ]);

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
