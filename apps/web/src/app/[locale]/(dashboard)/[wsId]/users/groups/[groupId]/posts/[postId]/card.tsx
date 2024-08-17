import React, { useState, useEffect } from 'react';
import { Card } from "@repo/ui/components/ui/card";
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { createClient } from '@/utils/supabase/client'; // Ensure you import your Supabase client

interface Props {
  user: WorkspaceUser;
  wsId: string;
  postId: string;
  groupId: string;
}

interface Post{
    post_id:string;
    user_id:string;
    notes: string | null;
    created_at: string;
    is_completed: boolean;
}
interface ButtonState {
  isClicked: boolean;
  saveType: string;
}

function UserCard({ user, wsId, postId, groupId }: Props) {
  const [buttonState, setButtonState] = useState<ButtonState>({
    isClicked: false,
    saveType: '',
  });
  const [notes, setNotes] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  const [isExist, setIsExist] = useState<Post | null>(null);

  const supabase = createClient(); 


  useEffect(() => {
    async function fetchData() {
      const { data, error } = await supabase
        .from('user_group_post_checks')
        .select('*')
        .eq('user_id', user.id)
        .eq('post_id', postId)
        .single(); 

      if (error) {
        console.error('Error fetching data:', error.message);
      } else if (data) {
        setIsExist(data);
        setNotes(data.notes)
        setIsCompleted(data.is_completed)
      }
    }
    fetchData();
  }, [supabase, user.id, postId]);

  async function handleSave() {
    const method = isCompleted !==null ? 'PUT' : 'POST';
    const endpoint = isCompleted !== null 
      ? `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}`
      : `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/`;

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.id,
        post_id: postId,
        notes: notes,
        is_completed: buttonState.saveType === 'approve',
        created_at: isExist ? isExist.created_at : new Date().toISOString()
      }),
    });

    if (response.ok) {
      console.log('Data saved/updated successfully');
      setIsCompleted(buttonState.saveType === 'approve');
    } else {
      console.error('Error saving/updating data');
    }
  }


  function handleClick(saveType: string) {
    setButtonState({
      isClicked: true,
      saveType: saveType,
    });
  }

  return (
    <Card className="rounded-lg shadow-md p-4 w-full max-w-lg">
      <div className="flex items-center">
        <img
          src="user_image_url"
          alt="User avatar"
          className="w-12 h-12 rounded-full object-cover"
        />
        <div className="ml-4 w-full">
          <h3 className="text-white text-lg text-foreground font-semibold">
            {user.full_name}
          </h3>
          <p className="text-foreground text-sm">{user.phone}</p>
          <Input
            placeholder="Notes"
            className="mt-2 w-full h-24 border border-gray-700 rounded-md p-2 text-white placeholder-gray-500 resize-none"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        {buttonState.isClicked && (
          <Button className="mr-2" onClick={handleSave}>
            {isCompleted !== null ? 'Update' :'Save' }
          </Button>
        )}
        <Button
          onClick={() => handleClick('reject')}
          className="px-4 py-1 mr-2 text-white bg-red-500 rounded-md hover:bg-red-600"
          disabled={isCompleted !== null && !isCompleted} 
        >
          Reject
        </Button>
        <Button
          onClick={() => handleClick('approve')}
          className="px-4 py-1 text-white bg-green-500 rounded-md hover:bg-green-600"
          disabled={isCompleted !== null && isCompleted} 
        >
          Approve
        </Button>
      </div>
    </Card>
  );
}

export default UserCard;
