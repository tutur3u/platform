'use client';

import { createAIWhitelistDomain } from '@tuturuuu/internal-api/infrastructure';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import WhitelistDomainForm from './domain-form';

interface Props {
  wsId: string;
  onFinish?: () => void;
}

export default function WhitelistDomainClient({ wsId, onFinish }: Props) {
  const t = useTranslations();
  const { toast } = useToast();

  const handleSubmit = async (values: {
    domain: string;
    description?: string;
  }) => {
    try {
      await createAIWhitelistDomain({
        description: values.description ?? null,
        domain: values.domain,
        enabled: true,
      });
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
