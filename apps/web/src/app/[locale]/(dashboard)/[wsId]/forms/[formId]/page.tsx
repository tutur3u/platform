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
        const {
          data: { user },
        } = await supabase.auth.getUser();

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

        const [responses, analytics] = await Promise.all([
          listFormResponses(adminClient, form, {
            query: resolvedSearchParams.q,
            page: Number(resolvedSearchParams.page ?? '1'),
            pageSize: Number(resolvedSearchParams.pageSize ?? '10'),
          }),
          getFormAnalytics(adminClient, form),
        ]);

        return (
          <FormStudio
            wsId={wsId}
            workspaceSlug={resolvedParams.wsId}
            mode="edit"
            initialForm={form}
            initialResponses={responses.records}
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
