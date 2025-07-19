'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { InternalEmail } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { CircleAlert, CircleSlash, MailCheck, Send } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import useEmail from '@/hooks/useEmail';

export default function PostsRowActions({ data }: { data: InternalEmail }) {
  const t = useTranslations();
  const { sendEmail, loading, error, success } = useEmail();

  const sendable =
    !!data.ws_id &&
    !!data.to_addresses.length &&
    !!data.to_addresses[0] &&
    !!data.subject &&
    !!data.payload;

  const handleSendEmail = async () => {
    if (
      !!data.ws_id &&
      !!data.to_addresses.length &&
      !!data.to_addresses[0] &&
      !!data.subject &&
      !!data.payload
    ) {
      const supabase = createClient();
      // 1. Fetch user_group_post_checks by email_id and user_id
      const { data: check, error: checkError } = await supabase
        .from('user_group_post_checks')
        .select('*')
        .eq('email_id', data.id)
        .eq('user_id', data.user_id)
        .maybeSingle();
      if (checkError || !check) {
        alert('Could not find post check for this email/user.');
        return;
      }
      // 2. Fetch post from user_group_posts
      const { data: post, error: postError } = await supabase
        .from('user_group_posts')
        .select('*')
        .eq('id', check.post_id)
        .maybeSingle();
      if (postError || !post || !post.group_id || !post.id) {
        alert('Could not find post or group for this email.');
        return;
      }
      // 3. Fetch user from workspace_users
      const { data: user, error: userError } = await supabase
        .from('workspace_users')
        .select('*')
        .eq('id', check.user_id)
        .maybeSingle();
      if (userError || !user || !user.email) {
        alert('Could not find user or user email for this email.');
        return;
      }
      // 4. Call sendEmail with the required structure
      await sendEmail({
        wsId: data.ws_id,
        groupId: post.group_id,
        postId: post.id,
        post: {
          id: post.id,
          title: post.title,
          content: post.content,
          notes: post.notes || '',
          group_name: '', // Optionally fetch group name if needed
          created_at: post.created_at,
        },
        users: [
          {
            id: user.id,
            email: user.email,
            username:
              user.display_name || user.full_name || user.email || '<No Name>',
            notes: check.notes || '',
            is_completed: check.is_completed,
          },
        ],
      });
    }
  };

  return (
    <div className="flex flex-none items-center justify-end gap-2">
      <Button
        size="xs"
        onClick={handleSendEmail}
        disabled={
          !!error ||
          loading ||
          !data.to_addresses.length ||
          !!data.id ||
          !sendable ||
          !data.to_addresses.some((address) => address.includes('@easy')) ||
          success
        }
        variant={
          error ? 'destructive' : !success && !loading ? undefined : 'outline'
        }
      >
        {data?.to_addresses.some((address) => address.includes('@easy')) ? (
          <CircleSlash className="h-4 w-4" />
        ) : error ? (
          <CircleAlert className="h-4 w-4" />
        ) : loading ? (
          <LoadingIndicator />
        ) : success || data.id ? (
          <MailCheck className="h-4 w-4" />
        ) : (
          <>
            <Send className="mr-1.5 h-4 w-4" />
            {t('post-email-data-table.send_email')}
          </>
        )}
      </Button>
    </div>
  );
}
