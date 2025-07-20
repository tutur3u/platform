import type { PostEmail } from './types';
import useEmail from '@/hooks/useEmail';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { CircleAlert, CircleSlash, MailCheck, Send } from '@tuturuuu/ui/icons';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';

export default function PostsRowActions({
  data,
  onEmailSent,
}: {
  data: PostEmail;
  onEmailSent?: () => void;
}) {
  const t = useTranslations();
  const { sendEmail, localLoading, localError, localSuccess } = useEmail();

  const sendable =
    !!data.email &&
    !!data.ws_id &&
    !!data.user_id &&
    !!data.post_id &&
    !!data.group_id &&
    !!data.group_name &&
    !!data.post_title &&
    !!data.post_content &&
    !!data?.is_completed;

  const handleSendEmail = async () => {
    // The local loading, error, and success states are now managed by useEmail hook

    if (
      !!data.email &&
      !!data.ws_id &&
      !!data.user_id &&
      !!data.post_id &&
      !!data.group_id &&
      !!data.group_name &&
      !!data.post_title &&
      !!data.post_content &&
      !!data?.is_completed
    ) {
      await sendEmail({
        wsId: data.ws_id,
        postId: data.post_id,
        groupId: data.group_id,
        post: {
          id: data.post_id,
          title: data.post_title,
          content: data.post_content,
          notes: data.notes || '',
          group_name: data.group_name,
          created_at:
            dayjs(data.post_created_at || data.created_at)?.toISOString() ||
            undefined,
        },
        users: [
          {
            id: data.user_id,
            email: data.email,
            username: data.recipient || data.email || '<Chưa có tên>',
            notes: data?.notes || '',
            is_completed: data?.is_completed,
          },
        ],
      });

      if (onEmailSent) onEmailSent();
    }
  };

  return (
    <div className="flex flex-none items-center justify-end gap-2">
      <Button
        size="xs"
        onClick={handleSendEmail}
        disabled={
          !!localError ||
          localLoading ||
          !data.email ||
          !!data.email_id ||
          !sendable ||
          data.email.includes('@easy') ||
          localSuccess
        }
        variant={
          localError
            ? 'destructive'
            : localLoading
              ? 'secondary'
              : localSuccess || data.email_id
                ? 'outline'
                : undefined
        }
        className="flex min-w-[90px] items-center gap-2"
      >
        {data?.email?.includes('@easy') ? (
          <CircleSlash className="h-4 w-4" />
        ) : localLoading ? (
          <>
            <LoadingIndicator />
            <span>{t('post-email-data-table.sending')}</span>
          </>
        ) : localError ? (
          <>
            <CircleAlert className="h-4 w-4" />
            <span>{t('post-email-data-table.error')}</span>
          </>
        ) : localSuccess || data.email_id ? (
          <>
            <MailCheck className="h-4 w-4" />
            <span>{t('post-email-data-table.sent')}</span>
          </>
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
