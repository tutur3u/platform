import { DraftsPage } from '@tuturuuu/ui/tu-do/drafts/drafts-page';
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
      <DraftsPage wsId={wsId} />
    </Suspense>
  );
}
