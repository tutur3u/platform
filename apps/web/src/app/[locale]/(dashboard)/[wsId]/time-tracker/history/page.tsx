import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { SessionHistory } from '../components/session-history';

export const metadata: Metadata = {
  title: 'History',
  description:
    'Manage History in the Time Tracker area of your Tuturuuu workspace.',
};

export default async function TimeTrackerHistoryPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId, workspace }) => {
        const user = await getCurrentSupabaseUser();
        const supabase = await createClient();

        if (!user) return notFound();

        const { data: categories } = await supabase
          .from('time_tracking_categories')
          .select('*')
          .eq('ws_id', wsId);

        return (
          <SessionHistory
            wsId={wsId}
            userId={user.id}
            categories={categories}
            workspace={workspace}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}

