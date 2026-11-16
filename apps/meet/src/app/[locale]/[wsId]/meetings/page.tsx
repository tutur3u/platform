import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getMeetWorkspaceContext } from '../workspace-context';
import { AuthorizedMeetingsContent } from './authorized-meetings-content';
import { MeetingsSkeleton } from './components/meetings-skeleton';

export const metadata: Metadata = {
  title: 'Meetings',
  description:
    'Manage Meetings in the Tuturuuu Meet area of your Tuturuuu workspace.',
};

interface MeetingsPageProps {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    search?: string;
  }>;
}

export default async function MeetingsPage({
  params,
  searchParams,
}: MeetingsPageProps) {
  await connection();

  const { wsId: id } = await params;
  const { wsId, user } = await getMeetWorkspaceContext(id);

  const t = await getTranslations('meet.call');

  const search = (await searchParams)?.search || '';

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <h1 className="font-semibold text-2xl tracking-tight">
        {t('meetings_title')}
      </h1>

      <Suspense fallback={<MeetingsSkeleton />}>
        <AuthorizedMeetingsContent
          accountId={user.id}
          wsId={wsId}
          search={search}
        />
      </Suspense>
    </div>
  );
}
