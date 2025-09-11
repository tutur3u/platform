'use client';

import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { addWhitelistDomain } from '../emails/actions';
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
      await addWhitelistDomain(
        wsId,
        values.domain,
        values.description ?? null,
        true
      );
      toast({
        title: t('common.success'),
        description: t('common.domain_added'),
      });
      onFinish?.();
      // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('common.error_adding_domain'),
        variant: 'destructive',
      });
    }
  };

  return <WhitelistDomainForm wsId={wsId} onSubmit={handleSubmit} />;
}
