import NotesContent from '@tuturuuu/ui/tu-do/notes/notes-content';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function NotesPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login`);

  return (
    <WorkspaceWrapper params={params}>
      {({ wsId }) => <NotesContent wsId={wsId} />}
    </WorkspaceWrapper>
  );
}
