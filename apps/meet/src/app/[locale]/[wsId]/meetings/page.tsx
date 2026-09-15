import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { getMeetWorkspaceContext } from '../workspace-context';
import { MeetingsContent } from './meetings-content';

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
    page?: string;
    pageSize?: string;
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

  const admin = await createAdminClient({ noCookie: true });
  const { data: identity, error: identityError } =
    await admin.auth.admin.getUserById(user.id);
  let hostingUnavailable = Boolean(identityError);
  const canCreate =
    !identityError &&
    (await canVerifiedAccountHostMeeting(user.id, identity.user).catch(() => {
      hostingUnavailable = true;
      return false;
    }));
  const t = await getTranslations('meet.call');

  const resolvedSearchParams = await searchParams;
  const page = parseInt(resolvedSearchParams?.page || '1', 10);
  const pageSize = parseInt(resolvedSearchParams?.pageSize || '10', 10);
  const search = resolvedSearchParams?.search || '';

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-3xl tracking-tight">
              {t('meetings_title')}
            </h1>
            <p className="text-muted-foreground">{t('meetings_description')}</p>
          </div>
        </div>
      </div>

      {!canCreate && (
        <p
          className="mb-6 rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm"
          role={hostingUnavailable ? 'alert' : undefined}
        >
          {t(
            hostingUnavailable ? 'hosting_unavailable' : 'creation_restricted'
          )}
        </p>
      )}
      <Suspense
        fallback={
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="mb-2 h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        }
      >
        <MeetingsContent
          accountId={user.id}
          canCreate={canCreate}
          wsId={wsId}
          page={page}
          pageSize={pageSize}
          search={search}
        />
      </Suspense>
    </div>
  );
}
