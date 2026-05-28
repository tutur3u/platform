import { MeetTogetherPage } from '@tuturuuu/ui/legacy/meet/page';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getMeetWorkspaceContext } from '../workspace-context';

export const metadata: Metadata = {
  title: 'Plans',
  description:
    'Manage Plans in the Tuturuuu Meet area of your Tuturuuu workspace.',
};

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
  const { wsId } = await getMeetWorkspaceContext(id);

  return (
    <div className="-m-4">
      <Suspense>
        <MeetTogetherPage wsId={wsId} path="" searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
