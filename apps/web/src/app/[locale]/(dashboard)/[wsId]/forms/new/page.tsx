import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { FormStudio } from '@/features/forms/form-studio';

interface PageProps {
  params: Promise<{ wsId: string }>;
}

export default async function NewFormPage({ params }: PageProps) {
  const resolvedParams = await params;

  return (
    <WorkspaceWrapper params={Promise.resolve(resolvedParams)}>
      {async ({ wsId }) => {
        const supabase = await createClient();
        const { user } = await resolveAuthenticatedSessionUser(supabase);

        if (!user) {
          notFound();
        }

        const { data: canManageForms } = await supabase.rpc(
          'has_workspace_permission',
          {
            p_user_id: user.id,
            p_ws_id: wsId,
            p_permission: 'manage_forms',
          }
        );

        if (!canManageForms) {
          notFound();
        }

        return (
          <FormStudio
            wsId={wsId}
            workspaceSlug={resolvedParams.wsId}
            mode="create"
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
