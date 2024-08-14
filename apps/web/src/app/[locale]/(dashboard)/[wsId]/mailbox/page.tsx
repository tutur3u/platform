import React from 'react';
import UserList from '@/components/userLIst';
import SendEmailForm from '@/components/sendEmailForm';
import { createClient } from '@/utils/supabase/server';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';

interface Props {
  params: {
    wsId: string;
  };
}

// Sample report data structure
interface UserGroupPost {
  id: string;
  groupid: string;
  title: string;
  content: string;
  notes: string;
  created_at: string;
}

export default async function MailBox({ params: { wsId } }: Props) {
  const supabase = createClient();
  const { data: userData, error } = await supabase
    .from('workspace_users')
    .select('*')
    .eq('ws_id', wsId);

  if (error) {
    return <div>Error fetching user data: {error.message}</div>;
  }

  if (!userData || userData.length === 0) {
    return <div>No users found.</div>;
  }

  // Sample report data for testing
  const reportData: UserGroupPost[] = [
    {
      id: '1',
      groupid: 'grp-001',
      title: 'Monthly Performance Report',
      content: 'This is the detailed content of the report for the group.',
      notes: 'These are additional notes about the performance.',
      created_at: '2024-08-14T06:27:02.264969+00:00',
    },
    {
      id: '2',
      groupid: 'grp-002',
      title: 'Weekly Update',
      content: 'This is the content of the weekly update for the group.',
      notes: 'Additional notes for the weekly update.',
      created_at: '2024-08-07T06:27:02.264969+00:00',
    },
  ];

  return (
    <div className='flex'>
      <SendEmailForm 
        users={userData as WorkspaceUser[]}  // Pass the fetched user data
        posts={reportData}                   // Pass the sample report data
        userGroupPostId="1"                  // Specify the ID of the report to send
      /> 
      <UserList users={userData as WorkspaceUser[]} />  {/* Pass the users to UserList */}
    </div>
  );
}
