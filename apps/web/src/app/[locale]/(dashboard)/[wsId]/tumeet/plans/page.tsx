import { MeetTogetherPage } from '@tuturuuu/ui/legacy/tumeet/page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

interface TumeetPageProps {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
  }>;
}

export default async function TumeetPage({
  params,
  searchParams,
}: TumeetPageProps) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  return (
    <div className="-m-4">
      <MeetTogetherPage wsId={wsId} searchParams={searchParams} />
    </div>
  );
}
