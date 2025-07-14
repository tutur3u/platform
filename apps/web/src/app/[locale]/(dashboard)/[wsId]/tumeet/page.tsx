import { MeetTogetherPage } from '@tuturuuu/ui/legacy/tumeet/page';

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
  const { wsId } = await params;
  return (
    <div className="-m-4">
      <MeetTogetherPage wsId={wsId} searchParams={searchParams} />
    </div>
  );
}
