'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import OtpLimitResetForm, { type OtpLimitResetFormValues } from './form';

export default function OtpLimitResetClient() {
  const router = useRouter();
  const t = useTranslations('otp-limit-resets');

  const handleSubmit = async (values: OtpLimitResetFormValues) => {
    const response = await fetch('/api/v1/infrastructure/otp-limits/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
    });

    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      relatedIpCount?: number;
      unblockedIpCount?: number;
    } | null;

    if (!response.ok) {
      throw new Error(payload?.message || t('reset_failed'));
    }

    toast.success(t('reset_success'), {
      description: t('reset_success_description', {
        relatedIpCount: payload?.relatedIpCount ?? 0,
        unblockedIpCount: payload?.unblockedIpCount ?? 0,
      }),
    });
    router.refresh();
  };

  return <OtpLimitResetForm onSubmit={handleSubmit} />;
}
