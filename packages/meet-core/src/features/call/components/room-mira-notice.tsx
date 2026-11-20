'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, Pause, Users } from '@tuturuuu/icons';
import {
  type RoomMiraConsent,
  readRoomMiraConsent,
  setRoomMiraChoice,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { MiraAvatar } from './mira-profile';

export const roomMiraConsentKey = (meetingId: string) => [
  'room-mira-consent',
  meetingId,
];

/**
 * Room Mira notice shown to every admitted participant while room Mira is
 * available. @mira answers only after everyone present chooses Continue;
 * anyone can pause it again.
 */
export function RoomMiraNotice({ meetingId }: { meetingId: string }) {
  const t = useTranslations('meet.call');
  const queryClient = useQueryClient();
  const consent = useQuery({
    queryKey: roomMiraConsentKey(meetingId),
    queryFn: () => readRoomMiraConsent(meetingId),
    // People join and choose while the panel is open; a pending Pause settles
    // within the in-flight request, so it refreshes sooner.
    refetchInterval: (query) => {
      const current = query.state.data;
      return current?.available && current.pausing ? 2000 : 15000;
    },
    retry: false,
  });
  const data = consent.data;
  const choose = useMutation({
    mutationFn: (choice: 'continue' | 'mute') =>
      setRoomMiraChoice(
        meetingId,
        choice,
        data && data.available ? data.version : ''
      ),
    onSuccess: (next: RoomMiraConsent) =>
      queryClient.setQueryData(roomMiraConsentKey(meetingId), next),
    onError: () => toast.error(t('room_mira_failed')),
  });
  if (!data?.available) return null;

  const pausing = data.pausing === true;
  const status = pausing
    ? t('room_mira_pausing')
    : data.choice === 'mute'
      ? t('room_mira_paused')
      : data.choice !== 'continue'
        ? t('room_mira_prompt')
        : data.fence.ready
          ? t('room_mira_ready')
          : t('room_mira_waiting', { count: data.fence.pending });

  return (
    <section
      aria-label={t('room_mira_title')}
      className="flex items-start gap-2 rounded-xl border p-3 text-sm"
    >
      <MiraAvatar size={20} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">{t('room_mira_title')}</p>
        <p
          className="inline-flex items-center gap-1.5 text-muted-foreground"
          role="status"
        >
          {pausing && <Loader2 className="size-3.5 animate-spin" />}
          {status}
        </p>
        {!pausing && (
          <div className="flex flex-wrap gap-2">
            {data.choice !== 'continue' && (
              <Button
                type="button"
                size="sm"
                disabled={choose.isPending}
                onClick={() => choose.mutate('continue')}
              >
                <Check className="size-4" />
                {t('room_mira_continue')}
              </Button>
            )}
            {data.choice !== 'mute' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={choose.isPending}
                onClick={() => choose.mutate('mute')}
              >
                <Pause className="size-4" />
                {t('room_mira_pause')}
              </Button>
            )}
            {data.choice === 'continue' && !data.fence.ready && (
              <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                <Users className="size-3.5" />
                {data.fence.admitted - data.fence.pending}/{data.fence.admitted}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
