import { DraftsPage } from '@tuturuuu/ui/tu-do/drafts/drafts-page';
import { TaskDialogWrapper } from '@tuturuuu/ui/tu-do/shared/task-dialog-wrapper';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function TaskDraftsPage({ params }: Props) {
  const { wsId } = await params;

  return (
    <Suspense>
      <TaskDialogWrapper isPersonalWorkspace={false} wsId={wsId}>
        <DraftsPage wsId={wsId} />
      </TaskDialogWrapper>
    </Suspense>
  );
}
