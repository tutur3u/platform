import React, { useEffect, useState } from 'react';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/client';
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Check, Save, X } from 'lucide-react';
import PostEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mailbox/send/post-template';
import useEmail from '@/hooks/useEmail';
import Image from 'next/image';
interface Props {
  user: WorkspaceUser;
  wsId: string;
  group: UserGroupPost;
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

export interface UserGroupPost {
  id?: string;
  ws_id?:string;
  name?: string;
  created_at?: string;
  archived?: string;
  ending_data?: string;
  notes?: string;
  sessions?: string;
  starting_data?: string;
}

interface ButtonState {
  isClicked: boolean;
  saveType: string;
}

function UserCard({ user, wsId,group, postId, groupId }: Props) {
  const [buttonState, setButtonState] = useState<ButtonState>({
    isClicked: false,
    saveType: '',
  });
  const [notes, setNotes] = useState<string | null>('');
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  const [isExist, setIsExist] = useState<Post | null>(null);
  const { sendEmail, loading, error, success } = useEmail();
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
    const method = isExist ? 'PUT' : 'POST';
    const endpoint =
      isExist
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

  const handleSendEmail = async () => {
    console.log("hello sned email");
    if (group) {
      await sendEmail({
        recipients: ['phathuynh@tuturuuu.com'],
        subject: `Easy Center | Báo cáo tiến độ - ${group.name}`,
        component: <PostEmailTemplate isHomeworkDone={isCompleted} post={group} />,
      });
    }
  };

  return (
    <Card className="w-full max-w-lg rounded-lg p-4 shadow-md">
      <div className="flex items-center">
        {user.avatar_url ? (
          <Image
            src={user.avatar_url}
            width={48}
            height={48}
            alt="User avatar"
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <Avatar className="h-12 w-12 rounded-full object-cover">
            <AvatarFallback>{user.full_name?  user.full_name.charAt(0) : 'u'}</AvatarFallback>
          </Avatar>
        )}
        <div className="ml-4 w-full">
          <h3 className="text-foreground text-lg font-semibold text-white">
            {user.full_name}
          </h3>
          <p className="text-foreground text-sm">
            {user.phone ? user.phone : 'No phone'}
          </p>
          <Input
            placeholder="Notes"
            value={notes || ''}
            className="mt-2 h-24 w-full resize-none rounded-md border border-gray-700 p-2 text-white placeholder-gray-500"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={handleSendEmail}
          disabled={loading}
          className="rounded-m mr-[200px] px-4 py-1 hover:bg-green-600"
        >
          Send Email
        </Button>
        {error && <p>Error: {error}</p>}
        {success && <p>Email sent successfully!</p>}
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
          <X />
        </Button>
        <Button
          onClick={() => handleClick('approve')}
          className="rounded-md bg-green-500 px-4 py-1 text-white hover:bg-green-600"
          disabled={isCompleted !== null && isCompleted}
        >
          <Check />
        </Button>
      </div>
    </Card>
  );
}

export default UserCard;
