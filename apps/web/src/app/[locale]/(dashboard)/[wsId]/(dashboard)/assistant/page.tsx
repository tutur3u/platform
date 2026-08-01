import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { AssistantHub } from './assistant-hub';

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { getCurrentUser } = await import('@tuturuuu/utils/user-helper');
  const currentUser = await getCurrentUser();
  if (!currentUser) notFound();

  return (
    <WorkspaceWrapper params={params}>
      {({ wsId }) => <AssistantHub currentUser={currentUser} wsId={wsId} />}
    </WorkspaceWrapper>
  );
}
