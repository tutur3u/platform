'use client';

import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { addWhitelistEmail } from './actions';
import WhitelistEmailForm from './form';

interface Props {
  wsId: string;
  onFinish?: () => void;
}

export default function WhitelistEmailClient({ wsId, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const { toast } = useToast();

  const handleSubmit = async (values: { email: string }) => {
    try {
      await addWhitelistEmail(values.email, false);
      toast({
        title: t('common.success'),
        description: t('common.email_added'),
      });
      onFinish?.();
      router.refresh();
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
