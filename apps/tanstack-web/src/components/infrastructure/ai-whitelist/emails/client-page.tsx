'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAIWhitelistEmail } from '@tuturuuu/internal-api/infrastructure/ai';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import WhitelistEmailForm, { type WhitelistEmailFormValues } from './form';
import { AI_WHITELIST_EMAILS_QUERY_KEY } from './query-keys';

interface WhitelistEmailClientProps {
  onFinish?: () => void;
  wsId: string;
}

export function WhitelistEmailClient({
  onFinish,
  wsId,
}: WhitelistEmailClientProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: (values: WhitelistEmailFormValues) =>
      createAIWhitelistEmail({ email: values.email, enabled: true }),
    onError: () => {
      toast.error(t('common.error'), {
        description: t('common.error_adding_email'),
      });
    },
    onSuccess: async () => {
      toast.success(t('common.success'), {
        description: t('common.email_added'),
      });
      await queryClient.invalidateQueries({
        queryKey: AI_WHITELIST_EMAILS_QUERY_KEY,
      });
      router.refresh();
    },
  });

  return (
    <WhitelistEmailForm
      wsId={wsId}
      onFinish={onFinish}
      onSubmit={async (values) => {
        await createMutation.mutateAsync(values);
      }}
    />
  );
}

export default WhitelistEmailClient;
