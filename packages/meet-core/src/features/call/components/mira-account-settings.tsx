'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { InternalApiError } from '@tuturuuu/internal-api';
import { withdrawMeetMiraAccount } from '@tuturuuu/internal-api/meet-call';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { useLocale, useTranslations } from 'next-intl';
import { useLiveSession } from '../../live-assistant/live-session-store';
import {
  miraAccountConfirmationKey,
  useMiraAccountConfirmation,
} from '../../live-assistant/use-mira-account-confirmation';
import { holdSelfCapture } from '../../meeting-ai/self-hold';
import { transcriptConsentKey } from '../../meeting-ai/use-transcript-consent';
import { roomMiraConsentKey } from './room-mira-key';

const incompleteWithdrawal = (error: unknown) =>
  error instanceof InternalApiError && error.code === 'withdraw_incomplete';

export function MiraAccountSettings({
  meetingId,
  accountId,
}: {
  meetingId: string;
  accountId: string;
}) {
  const t = useTranslations('meet.mira_consent');
  const settingsT = useTranslations('meet.mira_adults');
  const locale = useLocale();
  const client = useQueryClient();
  const session = useLiveSession(meetingId, accountId);
  const confirmation = useMiraAccountConfirmation(accountId);
  const withdraw = useMutation({
    mutationFn: (input: {
      meetingId: string;
      accountId: string;
      locale: string;
    }) =>
      withdrawMeetMiraAccount(input.meetingId, input.accountId, input.locale),
    retry: (failures, error) => failures === 0 && incompleteWithdrawal(error),
    retryDelay: 250,
    onMutate: () => {
      holdSelfCapture(meetingId);
      if (session && !['idle', 'ended', 'error'].includes(session.status))
        void session.controls.stop().catch(() => undefined);
    },
    onSettled: (view, _error, input) => {
      if (view) client.setQueryData(roomMiraConsentKey(input.meetingId), view);
      void client.invalidateQueries({
        queryKey: roomMiraConsentKey(input.meetingId),
      });
      void client.invalidateQueries({
        queryKey: transcriptConsentKey(input.meetingId),
      });
    },
    onSuccess: async (_view, input) => {
      const queryKey = miraAccountConfirmationKey(input.accountId);
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, false);
    },
  });
  const incomplete = incompleteWithdrawal(withdraw.error);
  const confirmed = confirmation.data === true;
  if (!confirmed && !confirmation.isError && withdraw.isIdle) return null;
  const submit = () => withdraw.mutate({ meetingId, accountId, locale });

  return (
    <SettingsSection description={t('withdraw_account_description')}>
      {confirmation.isError && withdraw.isIdle ? (
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
      ) : (
        <SettingsSectionBlock className="space-y-2">
          {(confirmed || incomplete) && (
            <Button
              type="button"
              variant="outline"
              disabled={withdraw.isPending}
              onClick={submit}
            >
              {incomplete ? settingsT('retry') : t('withdraw_account')}
            </Button>
          )}
          {withdraw.isSuccess && !confirmed && (
            <p role="status">{t('withdrawn_account')}</p>
          )}
          {withdraw.isError && (
            <p className="text-destructive text-sm" role="alert">
              {t(incomplete ? 'withdraw_incomplete' : 'withdraw_account_failed')}
            </p>
          )}
        </SettingsSectionBlock>
      )}
    </SettingsSection>
  );
}
