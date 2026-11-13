'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  readPrivateMiraPolicy,
  setPrivateMiraChoice,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export function PrivateMiraNotice({
  meetingId,
  onStop,
  onLeave,
  onAccepted,
}: {
  meetingId: string;
  onStop: () => Promise<void>;
  onLeave: () => void | Promise<void>;
  onAccepted: (accepted: boolean) => void;
}) {
  const t = useTranslations('meet.live');
  const client = useQueryClient();
  const key = ['mira-private-choice', meetingId];
  const policy = useQuery({
    queryKey: key,
    queryFn: () => readPrivateMiraPolicy(meetingId),
    retry: false,
  });
  const choice = useMutation({
    mutationFn: async (value: 'continue' | 'mute' | 'leave') => {
      if (!policy.data) throw new Error('Private Mira policy unavailable');
      if (value !== 'continue') await onStop();
      await setPrivateMiraChoice(meetingId, policy.data.version, value);
      const confirmed = await readPrivateMiraPolicy(meetingId);
      client.setQueryData(key, confirmed);
      onAccepted(
        confirmed.choice?.choice === 'continue' && confirmed.available
      );
      if (value === 'leave') await onLeave();
    },
  });
  return (
    <section
      className="space-y-3 rounded-lg border p-3"
      aria-label={t('phase_notice_title')}
    >
      <p className="text-sm">{t('phase_notice')}</p>
      <a
        className="text-sm underline"
        href="https://tuturuuu.com/privacy"
        target="_blank"
        rel="noreferrer"
      >
        {t('phase_legal')}
      </a>
      <p className="text-muted-foreground text-xs">{t('phase_retention')}</p>
      {(policy.isError || choice.isError) && (
        <p role="alert" className="text-destructive text-sm">
          {t('phase_choice_error')}
        </p>
      )}
      {policy.data && !policy.data.available && (
        <p role="status" className="text-sm">
          {t('phase_unavailable')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          autoFocus
          disabled={!policy.data?.available || choice.isPending}
          onClick={() => choice.mutate('continue')}
        >
          {t('phase_continue')}
        </Button>
        <Button
          variant="outline"
          disabled={!policy.data || choice.isPending}
          onClick={() => choice.mutate('mute')}
        >
          {t('phase_mute')}
        </Button>
        <Button
          variant="ghost"
          disabled={!policy.data || choice.isPending}
          onClick={() => choice.mutate('leave')}
        >
          {t('phase_leave')}
        </Button>
      </div>
    </section>
  );
}
