'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAIWhitelistDomain } from '@tuturuuu/internal-api/infrastructure/ai';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import WhitelistDomainForm, {
  type WhitelistDomainFormValues,
} from './domain-form';
import { AI_WHITELIST_DOMAINS_QUERY_KEY } from './query-keys';

interface Props {
  wsId: string;
  onFinish?: () => void;
}

export function WhitelistDomainClient({ wsId, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (values: WhitelistDomainFormValues) =>
      createAIWhitelistDomain({
        description: values.description ?? null,
        domain: values.domain,
        enabled: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: AI_WHITELIST_DOMAINS_QUERY_KEY,
      });
      router.refresh();
    },
  });

  const handleSubmit = async (values: WhitelistDomainFormValues) => {
    try {
      await createMutation.mutateAsync(values);
      toast({
        title: t('common.success'),
        description: t('common.domain_added'),
      });
      onFinish?.();
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('common.error_adding_domain'),
        variant: 'destructive',
      });
    }
  };

  return <WhitelistDomainForm wsId={wsId} onSubmit={handleSubmit} />;
}

export default WhitelistDomainClient;
