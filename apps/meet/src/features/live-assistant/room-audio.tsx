'use client';
import { Square, Volume2 } from '@tuturuuu/icons';
import { controlMeetLive } from '@tuturuuu/internal-api';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MiraAvatar } from '../call/components/mira-profile';
import { LiveAudioPlayer } from './audio';

const EVENT = 'meet:assistant-audio';
export function deliverRoomAssistantAudio(
  meetingId: string,
  message: MeetRealtimeServerMessage
) {
  if (
    ![
      'assistant.audio',
      'assistant.live',
      'assistant.interrupted',
      'room.ended',
    ].includes(message.type)
  )
    return false;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { meetingId, message } })
  );
  return message.type !== 'room.ended';
}
export function RoomAssistantAudio({
  meetingId,
  outputDeviceId,
  canManage = false,
}: {
  meetingId: string;
  outputDeviceId: string;
  canManage?: boolean;
}) {
  const t = useTranslations('meet.live');
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [stopping, setStopping] = useState(false);
  const player = useRef<LiveAudioPlayer | null>(null);
  useEffect(() => {
    const audio = new LiveAudioPlayer();
    player.current = audio;
    const sequences = new Map<string, number>();
    const listener = (event: Event) => {
      const { meetingId: id, message } = (
        event as CustomEvent<{
          meetingId: string;
          message: Extract<
            MeetRealtimeServerMessage,
            {
              type:
                | 'assistant.audio'
                | 'assistant.live'
                | 'assistant.interrupted'
                | 'room.ended';
            }
          >;
        }>
      ).detail;
      if (id !== meetingId) return;
      if (message.type === 'room.ended') {
        audio.interrupt();
        setAvailable(false);
        setSessionId(undefined);
        return;
      }
      if (message.type === 'assistant.interrupted') {
        audio.interrupt();
        return;
      }
      if (message.type === 'assistant.live') {
        setSessionId(message.active ? message.sessionId : undefined);
        setAvailable(message.active);
        if (!message.active) audio.interrupt();
        return;
      }
      if (
        id !== meetingId ||
        Math.abs(Date.now() - message.at) > 5000 ||
        message.sequence <= (sequences.get(message.sessionId) ?? -1)
      )
        return;
      sequences.set(message.sessionId, message.sequence);
      setAvailable(true);
      audio.play(message.data);
    };
    window.addEventListener(EVENT, listener);
    return () => {
      window.removeEventListener(EVENT, listener);
      audio.close();
    };
  }, [meetingId]);
  useEffect(() => {
    if (enabled)
      void player.current
        ?.unlock(outputDeviceId)
        .catch(() => toast.error(t('session_error')));
  }, [enabled, outputDeviceId, t]);
  if (!available) return null;
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="gap-2 rounded-full"
        onClick={async () => {
          if (enabled) {
            player.current?.close();
            setEnabled(false);
          } else {
            try {
              await player.current?.unlock(outputDeviceId);
              setEnabled(true);
            } catch {
              toast.error(t('session_error'));
            }
          }
        }}
      >
        <MiraAvatar size={18} />
        <Volume2 className="size-3.5" />
        {t(enabled ? 'room_audio_on' : 'room_audio_enable')}
      </Button>
      {canManage && sessionId && (
        <Button
          size="icon"
          variant="outline"
          aria-label={t('stop_room')}
          disabled={stopping}
          onClick={async () => {
            setStopping(true);
            try {
              await controlMeetLive(meetingId, { action: 'stop', sessionId });
              player.current?.interrupt();
              setAvailable(false);
            } catch {
              toast.error(t('session_error'));
            } finally {
              setStopping(false);
            }
          }}
        >
          <Square className="size-4" />
        </Button>
      )}
    </div>
  );
}
