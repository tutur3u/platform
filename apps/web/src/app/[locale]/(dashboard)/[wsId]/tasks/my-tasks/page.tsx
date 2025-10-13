import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import { MyTasksDataLoader } from './my-tasks-data-loader';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function MyTasksPage({ params }: Props) {
  const { locale } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  return (
    <WorkspaceWrapper params={params}>
      {({ wsId, isPersonal }) => (
        <MyTasksDataLoader
          wsId={wsId}
          userId={user.id}
          isPersonal={isPersonal}
        />
      )}
    </WorkspaceWrapper>
  );
}
