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



  return (
    <div className='flex'>
      <SendEmailForm users={userData as WorkspaceUser[]}  /> 
      <UserList users={userData as WorkspaceUser[]} />  {/* Pass the first user to UserList */}
    </div>
  );
}
