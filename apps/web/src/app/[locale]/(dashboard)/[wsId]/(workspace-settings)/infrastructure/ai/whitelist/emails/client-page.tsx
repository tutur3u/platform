'use client';

import { addWhitelistEmail } from './actions';
import WhitelistEmailForm from './form';
import { useToast } from '@tutur3u/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';

interface Props {
  wsId: string;
  onFinish?: () => void;
}

export default function WhitelistEmailClient({ wsId, onFinish }: Props) {
  const t = useTranslations();
  const { toast } = useToast();

  const handleSubmit = async (values: { email: string }) => {
    try {
      await addWhitelistEmail(wsId, values.email, true);
      toast({
        title: t('common.success'),
        description: t('common.email_added'),
      });
      onFinish?.();
      // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('common.error_adding_email'),
        variant: 'destructive',
      });
    }
  };

  return <WhitelistEmailForm wsId={wsId} onSubmit={handleSubmit} />;
}
