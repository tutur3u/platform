import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/client';
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Check, Save, X } from 'lucide-react';
// Ensure you import your Supabase client
import Image from 'next/image';
import React, { useEffect, useState } from 'react';

interface Props {
  user: WorkspaceUser;
  wsId: string;
  postId: string;
  groupId: string;
}

interface Post {
  post_id: string;
  user_id: string;
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
  const [notes, setNotes] = useState<string | null>('');
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
        setNotes(data.notes);
        setIsCompleted(data.is_completed);
      }
    }
    fetchData();
  }, [supabase, user.id, postId]);

  async function handleSave() {
    const method = isCompleted !== null ? 'PUT' : 'POST';
    const endpoint =
      isCompleted !== null
        ? `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/${postId}`
        : `/api/v1/workspaces/${wsId}/user-groups/${groupId}/group-checks/`;
    console.log('helllo notes ' + notes);
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
        created_at: isExist ? isExist.created_at : new Date().toISOString(),
      }),
    });

    if (response.ok) {
      console.log('Data saved/updated successfully');
      setIsCompleted(buttonState.saveType === 'approve');
      setButtonState({
        isClicked: false,
        saveType: '',
      });
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
    <Card className="w-full max-w-lg rounded-lg p-4 shadow-md">
      <div className="flex items-center">
        {user.avatar_url && (
          <Image
            src={user.avatar_url}
            width={12}
            height={12}
            alt="User avatar"
            className="h-12 w-12 rounded-full object-cover"
          />
        )}
        {!user.avatar_url && (
          <Avatar className="h-12 w-12 rounded-full object-cover">
            <AvatarFallback>T</AvatarFallback>
          </Avatar>
        )}
        <div className="ml-4 w-full">
          <h3 className="text-foreground text-lg font-semibold text-white">
            {user.full_name}
          </h3>
          <p className="text-foreground text-sm">{user.phone}</p>
          <Input
            placeholder="Notes"
            value={notes || ''}
            className="mt-2 h-24 w-full resize-none rounded-md border border-gray-700 p-2 text-white placeholder-gray-500"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        {buttonState.isClicked && (
          <Button className="mr-2" onClick={handleSave}>
            <Save />
          </Button>
        )}
        <Button
          onClick={() => handleClick('reject')}
          className="mr-2 rounded-md bg-red-500 px-4 py-1 text-white hover:bg-red-600"
          disabled={isCompleted !== null && !isCompleted}
        >
          <X></X>
        </Button>
        <Button
          onClick={() => handleClick('approve')}
          className="rounded-md bg-green-500 px-4 py-1 text-white hover:bg-green-600"
          disabled={isCompleted !== null && isCompleted}
        >
          <Check></Check>
        </Button>
      </div>
    </Card>
  );
}

export default UserCard;
