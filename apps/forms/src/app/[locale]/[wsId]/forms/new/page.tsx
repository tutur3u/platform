import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { resolveCollaboratorIdentity } from '@/features/forms/collaboration/identity';
import { FormStudio } from '@/features/forms/form-studio';
import { getFormsPageContext } from '@/lib/forms-permissions';

interface PageProps {
  params: Promise<{ wsId: string }>;
}

export default async function NewFormPage({ params }: PageProps) {
  await connection();

  const resolvedParams = await params;

  return (
    <WorkspaceWrapper params={Promise.resolve(resolvedParams)}>
      {async ({ wsId }) => {
        const context = await getFormsPageContext(wsId);

        if (!context?.canManageForms) {
          notFound();
        }

        const collaboratorIdentity = await resolveCollaboratorIdentity({
          adminClient: context.adminClient,
          user: context.user,
        });

        return (
          <FormStudio
            currentUser={collaboratorIdentity}
            wsId={wsId}
            workspaceSlug={resolvedParams.wsId}
            mode="create"
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
