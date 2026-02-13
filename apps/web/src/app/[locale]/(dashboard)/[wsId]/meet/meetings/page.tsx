import { createClient } from '@tuturuuu/supabase/next/server';
import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
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
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();
  const wsId = workspace?.id;

  const user = await getCurrentUser();

  if (!user?.id) redirect('/login');

  const supabase = await createClient();

  // Verify workspace access
  const { data: memberCheck } = await supabase
    .from('workspace_members')
    .select('id:user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (!memberCheck) {
    redirect('/onboarding');
  }

  const resolvedSearchParams = await searchParams;
  const page = parseInt(resolvedSearchParams?.page || '1', 10);
  const pageSize = parseInt(resolvedSearchParams?.pageSize || '10', 10);
  const search = resolvedSearchParams?.search || '';

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-3xl tracking-tight">Meetings</h1>
            <p className="text-muted-foreground">
              Integrated video conferencing with AI-powered features to make
              your meetings more productive.
            </p>
          </div>
        </div>
      </div>

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
          wsId={wsId}
          page={page}
          pageSize={pageSize}
          search={search}
        />
      </Suspense>
    </div>
  );
}
