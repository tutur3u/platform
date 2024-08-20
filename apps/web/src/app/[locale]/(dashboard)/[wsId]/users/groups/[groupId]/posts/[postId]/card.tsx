import PostEmailTemplate from '@/app/[locale]/(dashboard)/[wsId]/mailbox/send/post-template';
import useEmail from '@/hooks/useEmail';
import { cn } from '@/lib/utils';
import { GroupPostCheck } from '@/types/db';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { isEmail } from '@/utils/email-helper';
import { createClient } from '@/utils/supabase/client';
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { Check, Mail, MoveRight, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  user: WorkspaceUser;
  wsId: string;
  post: UserGroupPost;
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

function UserCard({ user, wsId, post }: Props) {
  const router = useRouter();

  const [check, setCheck] = useState<Partial<GroupPostCheck>>();
  const [saving, setSaving] = useState(false);

  const { sendEmail, loading, error, success } = useEmail();

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
        setCheck(data);
      } else {
        setCheck({
          user_id: user.id,
          post_id: post.id,
        });
      }

      setSaving(false);
    }

    fetchData();
  }, [supabase, user.id, post.id, check?.user_id, check?.post_id]);

  async function handleSaveStatus({ isCompleted }: { isCompleted: boolean }) {
    if (
      !user.id ||
      !post.id ||
      !post.group_id ||
      isCompleted === check?.is_completed
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
      }),
    });

    if (response.ok) {
      console.log('Data saved/updated successfully');
      setCheck((prev) => ({
        ...prev,
        user_id: user.id,
        post_id: post.id,
        is_completed: isCompleted,
      }));
      router.refresh();
    } else {
      console.error('Error saving/updating data');
    }

    setSaving(false);
  }

  const handleSendEmail = async () => {
    if (post) {
      await sendEmail({
        recipients: ['phathuynh@tuturuuu.com'],
        subject: `Easy Center | Báo cáo tiến độ ngày ${new Date().toLocaleDateString()}`,
        component: (
          <PostEmailTemplate isHomeworkDone={check?.is_completed} post={post} />
        ),
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
          <h3 className="text-foreground text-lg font-semibold">
            {user.full_name}
          </h3>
          <p className="text-foreground text-sm">
            {user.phone ? user.phone : 'No phone'}
          </p>
        </div>
      </div>

      <Textarea
        placeholder="Notes"
        value={check?.notes || ''}
        onChange={(e) =>
          setCheck((prev) => ({
            ...prev,
            notes: e.target.value || '',
          }))
        }
      />

      <div className="mt-4 flex justify-between">
        <div>
          <Button
            onClick={handleSendEmail}
            disabled={
              loading ||
              !user.email ||
              user.email.endsWith('@easy.com' || !isEmail(user.email)) ||
              check?.is_completed == null
            }
            variant="secondary"
          >
            <Mail className="mr-2" />
            <span className="opacity-70">Send email</span>
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
          {success && <p>Email sent successfully!</p>}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={
              check?.is_completed != null && check.is_completed
                ? 'outline'
                : 'ghost'
            }
            onClick={() => handleSaveStatus({ isCompleted: false })}
            className={cn(
              check?.is_completed != null && !check.is_completed
                ? 'bg-dynamic-red/10 border-dynamic-red/20 text-dynamic-red hover:bg-dynamic-red/20'
                : '',
              'border'
            )}
            disabled={saving || !check}
          >
            <X />
          </Button>
          <Button
            variant={
              check?.is_completed != null && !check.is_completed
                ? 'outline'
                : 'ghost'
            }
            onClick={() => handleSaveStatus({ isCompleted: true })}
            className={cn(
              check?.is_completed != null && check.is_completed
                ? 'bg-dynamic-green/10 border-dynamic-green/20 text-dynamic-green hover:bg-dynamic-green/20'
                : '',
              'border'
            )}
            disabled={saving || !check}
          >
            <Check />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default UserCard;
