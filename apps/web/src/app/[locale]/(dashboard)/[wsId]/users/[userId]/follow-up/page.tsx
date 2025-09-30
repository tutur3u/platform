import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import FollowUpClient from './client';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

export const metadata: Metadata = {
  title: 'Guest Lead Follow-up',
  description:
    'Configure and send a specialized follow-up report to a guest user.',
};

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    userId: string;
  }>;
}

export default async function GuestLeadFollowUpPage({ params }: Props) {
  const { wsId: id, userId } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  // Fetch user info and their groups for context
  const { data: user } = await supabase
    .from('workspace_users')
    .select('id, full_name, email, ws_id')
    .eq('ws_id', wsId)
    .eq('id', userId)
    .maybeSingle();

  // Fetch user's groups for report context
  const { data: userGroups } = await supabase
    .from('workspace_user_groups_users')
    .select('group:workspace_user_groups!inner(id, name, ws_id)')
    .eq('user_id', userId)
    .eq('group.ws_id', wsId);

  // Fetch workspace email credentials on the server
  const { data: emailCreds } = await sbAdmin
    .from('workspace_email_credentials')
    .select('source_name, source_email')
    .eq('ws_id', wsId)
    .maybeSingle();

  const {data: minimumAttendance} = await supabase
    .from('workspace_settings')
    .select('guest_user_checkup_threshold')
    .eq('ws_id', wsId)
    .maybeSingle();


  return (
    <div className="flex w-full flex-col gap-4">
      <FollowUpClient
        wsId={wsId}
        userId={userId}
        userName={user?.full_name ?? undefined}
        userEmail={user?.email ?? undefined}
        emailCredentials={emailCreds ?? undefined}
        userGroups={
          userGroups?.map((ug) => ({
            id: ug.group.id,
            name: ug.group.name,
          })) ?? []
        }
        minimumAttendance={minimumAttendance?.guest_user_checkup_threshold ?? undefined}
      />
    </div>
  );
}
