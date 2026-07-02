'use client';

import { createAIWhitelistEmail } from '@tuturuuu/internal-api/infrastructure/ai';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import WhitelistEmailForm from './form';

interface Props {
  wsId: string;
  onFinish?: () => void;
}

export default function WhitelistEmailClient({ wsId, onFinish }: Props) {
  const t = useTranslations();
  const { toast } = useToast();

  const handleSubmit = async (values: { email: string }) => {
    try {
      await createAIWhitelistEmail({ email: values.email, enabled: true });
      toast({
        title: t('common.success'),
        description: t('common.email_added'),
      });
      onFinish?.();
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('common.error_adding_email'),
        variant: 'destructive',
      });
    }
  };

  return <WhitelistEmailForm wsId={wsId} onSubmit={handleSubmit} />;
}
