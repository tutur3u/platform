import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SessionHistory } from '../components/session-history';
import WorkspaceWrapper from '@/components/workspace-wrapper';

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
      {async ({ wsId }) => {
        const user = await getCurrentSupabaseUser();
        const supabase = await createClient();

        if (!user) return notFound();

        const { data: categories } = await supabase
          .from('time_tracking_categories')
          .select('*')
          .eq('ws_id', wsId);

        const { data: sessions } = await supabase
          .from('time_tracking_sessions')
          .select('*, category:time_tracking_categories(*), task:tasks(*)')
          .eq('ws_id', wsId)
          .eq('user_id', user.id)
          .order('start_time', { ascending: false })
          .limit(100);

        return (
          <SessionHistory
            wsId={wsId}
            sessions={sessions}
            categories={categories}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
