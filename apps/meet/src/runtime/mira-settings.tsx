'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { withdrawMeetMiraAccountFromSettings } from '@tuturuuu/internal-api/meet-call';
import {
  miraAccountConfirmationKey,
  useMiraAccountConfirmation,
} from '@tuturuuu/meet-core/features/live-assistant/use-mira-account-confirmation';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';

export function MiraSettings({ accountId }: { accountId: string }) {
  const t = useTranslations('meet.mira_consent');
  const settingsT = useTranslations('meet.mira_adults');
  const client = useQueryClient();
  const confirmation = useMiraAccountConfirmation(accountId);
  const withdraw = useMutation({
    mutationFn: () => withdrawMeetMiraAccountFromSettings(accountId),
    onSuccess: async () => {
      const queryKey = miraAccountConfirmationKey(accountId);
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, false);
    },
  });

  const confirmed = confirmation.data === true;
  if (confirmation.isPending) return null;
  if (confirmation.isError && withdraw.isIdle)
    return (
      <SettingsSection>
        <SettingsSectionMessage
          tone="error"
          action={
            <Button
              type="button"
              variant="outline"
              onClick={() => void confirmation.refetch()}
            >
              {settingsT('retry')}
            </Button>
          }
        >
          {t('withdraw_account_load_failed')}
        </SettingsSectionMessage>
      </SettingsSection>
    );

  return (
    <SettingsSection>
      <SettingsSectionBlock className="space-y-2">
        {(confirmed || withdraw.isError || withdraw.isPending) && (
          <Button
            type="button"
            variant="outline"
            disabled={withdraw.isPending}
            onClick={() => withdraw.mutate()}
          >
            {withdraw.isError || !confirmed
              ? settingsT('retry')
              : t('withdraw_account')}
          </Button>
        )}
        {confirmation.data === false && withdraw.isIdle && (
          <p className="text-muted-foreground text-sm">
            {t('account_not_confirmed')}
          </p>
        )}
        {withdraw.isSuccess && !confirmed && (
          <p role="status">{t('withdrawn_account')}</p>
        )}
        {withdraw.isError && (
          <p className="text-destructive text-sm" role="alert">
            {t('withdraw_account_failed')}
          </p>
        )}
      </SettingsSectionBlock>
    </SettingsSection>
  );
}
