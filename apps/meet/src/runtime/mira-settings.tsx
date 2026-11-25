'use client';

import { useMutation } from '@tanstack/react-query';
import { withdrawMeetMiraAccountFromSettings } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';

export function MiraSettings({ accountId }: { accountId: string }) {
  const t = useTranslations('meet.mira_consent');
  const withdraw = useMutation({
    mutationFn: () => withdrawMeetMiraAccountFromSettings(accountId),
  });

  return (
    <SettingsSection>
      <Button
        type="button"
        variant="outline"
        disabled={withdraw.isPending}
        onClick={() => withdraw.mutate()}
      >
        {t('withdraw_account')}
      </Button>
      {withdraw.status === 'success' && (
        <p role="status">{t('withdrawn_account')}</p>
      )}
      {withdraw.status === 'error' && (
        <p className="text-destructive text-sm" role="alert">
          {t('withdraw_account_failed')}
        </p>
      )}
    </SettingsSection>
  );
}
