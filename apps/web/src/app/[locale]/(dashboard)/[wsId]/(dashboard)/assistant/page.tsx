import WorkspaceWrapper from '@/components/workspace-wrapper';
import AssistantClient from './assistant-client';

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {({ wsId }) => <AssistantClient wsId={wsId} />}
    </WorkspaceWrapper>
  );
}
