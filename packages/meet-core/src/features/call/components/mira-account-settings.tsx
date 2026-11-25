'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { withdrawMeetMiraAccount } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useLocale, useTranslations } from 'next-intl';
import { useLiveSession } from '../../live-assistant/live-session-store';
import { holdSelfCapture } from '../../meeting-ai/self-hold';
import { transcriptConsentKey } from '../../meeting-ai/use-transcript-consent';
import { roomMiraConsentKey } from './room-mira-key';

export function MiraAccountSettings({
  meetingId,
  accountId,
}: {
  meetingId: string;
  accountId: string;
}) {
  const t = useTranslations('meet.mira_consent');
  const locale = useLocale();
  const client = useQueryClient();
  const session = useLiveSession(meetingId, accountId);
  const withdraw = useMutation({
    mutationFn: () => withdrawMeetMiraAccount(meetingId, accountId, locale),
    onMutate: () => {
      holdSelfCapture(meetingId);
      if (session && !['idle', 'ended', 'error'].includes(session.status))
        void session.controls.stop().catch(() => undefined);
    },
    onSettled: (view) => {
      if (view) client.setQueryData(roomMiraConsentKey(meetingId), view);
      void client.invalidateQueries({ queryKey: roomMiraConsentKey(meetingId) });
      void client.invalidateQueries({ queryKey: transcriptConsentKey(meetingId) });
    },
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
      {withdraw.isSuccess && <p role="status">{t('withdrawn_account')}</p>}
      {withdraw.isError && (
        <p className="text-destructive text-sm" role="alert">
          {t('save_failed')}
        </p>
      )}
    </SettingsSection>
  );
}
