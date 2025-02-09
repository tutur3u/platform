'use client';

import LoadingIndicator from '@/components/common/LoadingIndicator';
import useEmail from '@/hooks/useEmail';
import { cn } from '@/lib/utils';
import { isEmail } from '@/utils/email-helper';
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { createClient } from '@tutur3u/supabase/next/client';
import type { GroupPostCheck } from '@tutur3u/types/db';
import type { WorkspaceUser } from '@tutur3u/types/primitives/WorkspaceUser';
import {
  Check,
  CircleSlash,
  Mail,
  MailCheck,
  MoveRight,
  Save,
  Send,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  user: WorkspaceUser;
  wsId: string;
  post: UserGroupPost;
  hideEmailSending: boolean;
  disableEmailSending: boolean;
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

function UserCard({
  user,
  wsId,
  post,
  hideEmailSending,
  disableEmailSending,
}: Props) {
  const router = useRouter();

  const [check, setCheck] = useState<Partial<GroupPostCheck>>();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { sendEmail, loading, error, success } = useEmail();

  useEffect(() => {
    if (success) router.refresh();
  }, [success]);

  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      if (!user.id || !post.id) return;
      setSaving(true);

      const { data, error } = await supabase
        .from('user_group_post_checks')
        .select('*')
        .eq('user_id', user.id)
        .eq('post_id', post.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching data:', error.message);
      } else if (data) {
        setCheck({
          ...data,
          notes: data.notes || '',
        });
        setNotes(data.notes || '');
      } else {
        setCheck({
          user_id: user.id,
          post_id: post.id,
          notes: '',
        });
        setNotes('');
      }

      setSaving(false);
    }

    fetchData();
  }, [supabase, user.id, post.id]);

  async function handleSaveStatus({
    isCompleted,
    notes,
  }: {
    isCompleted?: boolean | null;
    notes: string;
  }) {
    if (
      !user.id ||
      !post.id ||
      !post.group_id ||
      (isCompleted === check?.is_completed && notes === check?.notes)
    )
      return;

    setSaving(true);

    const method = check?.user_id && check.post_id ? 'PUT' : 'POST';

    const endpoint =
      check?.user_id && check.post_id
        ? `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks/${post.id}`
        : `/api/v1/workspaces/${wsId}/user-groups/${post.group_id}/group-checks`;

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...check,
        user_id: user.id,
        post_id: post.id,
        is_completed: isCompleted,
        notes,
      }),
    });

    if (response.ok) {
      console.log('Data saved/updated successfully');
      if (isCompleted == null)
        setCheck({
          user_id: user.id,
          post_id: post.id,
          notes,
        });
      else
        setCheck((prev) => ({
          ...prev,
          user_id: user.id,
          post_id: post.id,
          is_completed: isCompleted ?? check?.is_completed ?? true,
          notes,
        }));

      router.refresh();
    } else {
      console.error('Error saving/updating data');
    }

    setSaving(false);
  }

  const handleSendEmail = async () => {
    if (post && user.email && check?.is_completed != null) {
      await sendEmail({
        wsId,
        postId: post.id!,
        groupId: post.group_id!,
        post,
        users: [
          {
            id: user.id,
            email: user.email,
            username:
              user.full_name ||
              user.display_name ||
              user.email ||
              '<Chưa có tên>',
            notes: check?.notes || '',
            is_completed: check?.is_completed,
          },
        ],
      });
    }
  };

  return (
    <Card className="w-full rounded-lg p-4 shadow-md">
      <div className="mb-4 flex items-center">
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
          <h3 className="text-lg font-semibold text-foreground">
            {user.full_name}
          </h3>
          {(user.email || user.phone) && (
            <p className="text-sm text-foreground">
              {user.email || user.phone}
            </p>
          )}
        </div>
      </div>

      <Textarea
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={saving || !check}
      />

      <div
        className={cn(
          'mt-4 flex flex-wrap justify-between gap-2',
          hideEmailSending && 'justify-end'
        )}
      >
        <div className="flex w-full items-center justify-center gap-2">
          {check && check.notes !== notes ? (
            <Button
              onClick={() =>
                handleSaveStatus({
                  notes,
                })
              }
              disabled={saving || !check}
            >
              <Save />
            </Button>
          ) : (
            <>
              <Button
                variant={
                  check?.is_completed != null && check.is_completed
                    ? 'outline'
                    : 'ghost'
                }
                onClick={() =>
                  handleSaveStatus({
                    isCompleted: false,
                    notes,
                  })
                }
                className={cn(
                  check?.is_completed != null && !check.is_completed
                    ? 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20 hover:text-dynamic-red'
                    : '',
                  'w-full border'
                )}
                disabled={saving || !check}
              >
                <X />
              </Button>
              <Button
                variant={check?.is_completed != null ? 'outline' : 'ghost'}
                onClick={() =>
                  handleSaveStatus({
                    isCompleted: null,
                    notes,
                  })
                }
                className={cn(
                  check?.is_completed == null
                    ? 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20 hover:text-dynamic-blue'
                    : '',
                  'w-full border'
                )}
                disabled={saving || !check}
              >
                <CircleSlash />
              </Button>
              <Button
                variant={check?.is_completed == null ? 'outline' : 'ghost'}
                onClick={() => handleSaveStatus({ isCompleted: true, notes })}
                className={cn(
                  check?.is_completed != null && check.is_completed
                    ? 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20 hover:text-dynamic-green'
                    : '',
                  'w-full border'
                )}
                disabled={saving || !check}
              >
                <Check />
              </Button>
            </>
          )}
        </div>

        {hideEmailSending ? (
          <div>
            <Button variant="secondary" disabled>
              {disableEmailSending || success ? (
                <MailCheck className="h-6 w-6" />
              ) : (
                <Send className="h-6 w-6" />
              )}
            </Button>
          </div>
        ) : (
          <div className="w-full">
            <Button
              onClick={handleSendEmail}
              disabled={
                disableEmailSending ||
                success ||
                loading ||
                !user.email ||
                !isEmail(user.email) ||
                user.email.endsWith('@easy.com') ||
                check?.is_completed == null ||
                saving ||
                !check ||
                (check?.notes != null && check?.notes !== notes)
              }
              variant={
                loading || disableEmailSending || success
                  ? 'secondary'
                  : undefined
              }
              className="w-full"
            >
              <Mail className="mr-2" />
              <span className="flex items-center justify-center opacity-70">
                {loading ? (
                  <LoadingIndicator />
                ) : disableEmailSending || success ? (
                  'Email sent'
                ) : (
                  'Send email'
                )}
              </span>
              {user.email && (
                <>
                  <MoveRight className="mx-2 hidden h-4 w-4 opacity-70 md:inline-block" />
                  <span className="hidden underline md:inline-block">
                    {user.email}
                  </span>
                </>
              )}
            </Button>
            {error && <p>Error: {error}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

export default UserCard;
