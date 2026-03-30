'use client';

import { useMutation } from '@tanstack/react-query';
import { LoaderCircle, Send } from '@tuturuuu/icons';
import { forceSendWorkspacePostEmail } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface ForceSendPostButtonProps {
  wsId: string;
  postId: string;
  userId: string;
  disabled?: boolean;
  compact?: boolean;
  onCompleted?: () => void;
}

export function ForceSendPostButton({
  wsId,
  postId,
  userId,
  disabled = false,
  compact = false,
  onCompleted,
}: ForceSendPostButtonProps) {
  const t = useTranslations('post-email-data-table');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async () =>
      forceSendWorkspacePostEmail(wsId, {
        postId,
        userId,
      }),
    onSuccess: () => {
      toast.success(t('force_send_success'));
      router.refresh();
      onCompleted?.();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : tCommon('error'));
    },
  });

  return (
    <Button
      size={compact ? 'sm' : 'default'}
      variant="outline"
      onClick={() => mutation.mutate()}
      disabled={disabled || mutation.isPending}
    >
      {mutation.isPending ? (
        <LoaderCircle className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Send className="mr-1 h-4 w-4" />
      )}
      {t('force_send')}
    </Button>
  );
}
