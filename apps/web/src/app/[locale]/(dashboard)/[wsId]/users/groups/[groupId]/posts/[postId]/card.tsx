import PostEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mailbox/send/post-template';
import useEmail from '@/hooks/useEmail';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createClient } from '@/utils/supabase/client';
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Input } from '@repo/ui/components/ui/input';
import { Check, Save, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface Props {
  user: WorkspaceUser;
  wsId: string;
  post: UserGroupPost;
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
  title: string | null;
  content: string | null;
  ws_id?: string;
  name?: string;
  created_at?: string;
  notes: string | null;
  group_id?: string;
  group_name?: string;
}

interface ButtonState {
  isClicked: boolean;
  saveType: string;
}

function UserCard({ user, wsId, post }: Props) {
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
      if (!user.id || !post.id) return;

      const { data, error } = await supabase
        .from('user_group_post_checks')
        .select('*')
        .eq('user_id', user.id)
        .eq('post_id', post.id)
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
  }, [supabase, user.id, post.id]);

  async function handleSave() {
    if (!user.id || !post.id || !post.group_id) return;

    const method = isExist ? 'PUT' : 'POST';
    const endpoint = isExist
      ? `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks/${post.id}`
      : `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks/`;

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.id,
        post_id: post.id,
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
    console.log('hello sned email');
    if (post) {
      await sendEmail({
        recipients: ['phathuynh@tuturuuu.com'],
        subject: `Easy Center | Báo cáo tiến độ ngày ${new Date().toLocaleDateString()}`,
        component: (
          <PostEmailTemplate
            isHomeworkDone={isCompleted ?? undefined}
            post={post}
          />
        ),
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
            <AvatarFallback>
              {user.full_name ? user.full_name.charAt(0) : 'u'}
            </AvatarFallback>
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
