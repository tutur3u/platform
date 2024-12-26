import LoadingIndicator from '@/components/common/LoadingIndicator';
import useEmail from '@/hooks/useEmail';
import { PostEmail } from '@/types/primitives/post-email';
import { Button } from '@repo/ui/components/ui/button';
import dayjs from 'dayjs';
import { CircleAlert, CircleSlash, MailCheck, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function RowActions({ data }: { data: PostEmail }) {
  const t = useTranslations();
  const { sendEmail, loading, error, success } = useEmail();

  const sendable =
    !!data.email &&
    !!data.ws_id &&
    !!data.user_id &&
    !!data.post_id &&
    !!data.group_id &&
    !!data.group_name &&
    !!data?.is_completed != null;

  const handleSendEmail = async () => {
    if (sendable) {
      await sendEmail({
        wsId: data.ws_id!,
        postId: data.post_id!,
        groupId: data.group_id!,
        post: {
          id: data.post_id!,
          title: data.post_title!,
          content: data.post_content!,
          notes: data.notes || '',
          group_name: data.group_name!,
          created_at:
            dayjs(data.post_created_at || data.created_at)?.toISOString() ||
            undefined,
        },
        users: [
          {
            id: data.user_id!,
            email: data.email!,
            username: data.recipient || data.email || '<Chưa có tên>',
            notes: data?.notes || '',
            is_completed: data?.is_completed!,
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
          !data.email ||
          !!data.email_id ||
          !sendable ||
          data.email.includes('@easy') ||
          success
        }
        variant={
          error
            ? 'destructive'
            : !success && !loading && data.email && !data.email_id
              ? undefined
              : 'outline'
        }
      >
        {data?.email?.includes('@easy') ? (
          <CircleSlash className="h-4 w-4" />
        ) : error ? (
          <CircleAlert className="h-4 w-4" />
        ) : loading ? (
          <LoadingIndicator />
        ) : success || data.email_id ? (
          <MailCheck className="h-4 w-4" />
        ) : (
          <>
            <Send className="mr-1.5 h-4 w-4" />
            {t('post-email-data-table.send_email')}
          </>
        )}
      </Button>
      {/* <Button size="xs" variant="outline" disabled>
        <Eye className="mr-1.5 h-4 w-4" />
        {t(`${namespace}.preview`)}
      </Button> */}
    </div>
  );
}
