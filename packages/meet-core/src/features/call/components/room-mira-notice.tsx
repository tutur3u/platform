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
import { type ReactNode, useId } from 'react';
import { MiraAdultNotice } from '../../live-assistant/mira-adult-notice';
import { RoomMiraChip, type RoomMiraChipState } from './room-mira-chip';

export const roomMiraConsentKey = (meetingId: string) => [
  'room-mira-consent',
  meetingId,
];

/**
 * Room Mira notice shown to every admitted participant while room Mira is
 * available. @mira answers only after everyone present chooses Continue;
 * anyone can pause it again. The chat shows one chip; the 18+ rule, the
 * viewer's Continue or Pause, the progress and `details` (what the host
 * allows Mira to do) open from it. Without room Mira, `details` alone sits
 * behind the same chip.
 */
export function RoomMiraNotice({
  meetingId,
  details,
}: {
  meetingId: string;
  details?: ReactNode;
}) {
  const t = useTranslations('meet.call');
  const adultNoticeId = useId();
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
  if (!data?.available) {
    if (consent.isLoading || !details) return null;
    return (
      <RoomMiraChip
        state="permissions"
        label={t('miraEverywhere.permissions.title')}
        detailsLabel={t('room_mira_details')}
        title={t('miraEverywhere.permissions.title')}
      >
        {details}
      </RoomMiraChip>
    );
  }

  const pausing = data.pausing === true;
  const state: Exclude<RoomMiraChipState, 'permissions'> = pausing
    ? 'pausing'
    : data.choice === 'mute'
      ? 'paused'
      : data.choice !== 'continue'
        ? 'choose'
        : data.fence.ready
          ? 'ready'
          : 'waiting';
  const status = {
    pausing: t('room_mira_pausing'),
    paused: t('room_mira_paused'),
    choose: t('room_mira_prompt'),
    ready: t('room_mira_ready'),
    waiting: t('room_mira_waiting', { count: data.fence.pending }),
  }[state];
  const chip = {
    pausing: t('room_mira_chip_pausing'),
    paused: t('room_mira_chip_paused'),
    choose: t('room_mira_chip_choose'),
    ready: t('room_mira_chip_ready'),
    waiting: t('room_mira_chip_waiting', { count: data.fence.pending }),
  }[state];

  return (
    <RoomMiraChip
      state={state}
      label={chip}
      detailsLabel={t('room_mira_details')}
      title={t('room_mira_title')}
    >
      <p className="font-medium">{t('room_mira_title')}</p>
      <p
        className="inline-flex items-start gap-1.5 text-muted-foreground"
        role="status"
      >
        {pausing && <Loader2 className="mt-0.5 size-3.5 animate-spin" />}
        {status}
      </p>
      <MiraAdultNotice
        consent={!pausing && data.choice !== 'continue'}
        id={adultNoticeId}
      />
      {!pausing && (
        <div className="flex flex-wrap items-center gap-2">
          {data.choice !== 'continue' && (
            <Button
              type="button"
              size="sm"
              disabled={choose.isPending}
              aria-describedby={adultNoticeId}
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
      {details}
    </RoomMiraChip>
  );
}
