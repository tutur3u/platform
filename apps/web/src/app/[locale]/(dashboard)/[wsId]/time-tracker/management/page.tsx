import { groupSessions } from '@/lib/time-tracking-helper';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { notFound } from 'next/navigation';
import TimeTrackerManagementClient from './client';

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function TimeTrackerManagementPage({ params }: Props) {
  const { wsId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const isRootUser = user.email?.endsWith('@tuturuuu.com');
  if (!isRootUser) notFound();

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;
  if (!isRootWorkspace) notFound();

  const { data: workspaceMember } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();
  if (!workspaceMember) notFound();

  const { data: sessions } = await supabase
    .from('time_tracking_sessions')
    .select(`
      *,
      category:time_tracking_categories(name, color),
      user:users(display_name, avatar_url)
    `)
    .eq('ws_id', wsId);

  const groupedSessions = groupSessions(sessions || []);
  return <TimeTrackerManagementClient groupedSessions={groupedSessions} />;
}
