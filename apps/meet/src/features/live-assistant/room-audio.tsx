'use client';
import { Volume2 } from '@tuturuuu/icons';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MiraAvatar } from '../call/components/mira-profile';
import { LiveAudioPlayer } from './audio';

const EVENT = 'meet:assistant-audio';
export function deliverRoomAssistantAudio(
  meetingId: string,
  message: MeetRealtimeServerMessage
) {
  if (message.type !== 'assistant.audio' && message.type !== 'assistant.live')
    return false;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { meetingId, message } })
  );
  return true;
}
export function RoomAssistantAudio({
  meetingId,
  outputDeviceId,
}: {
  meetingId: string;
  outputDeviceId: string;
}) {
  const t = useTranslations('meet.live');
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
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
            { type: 'assistant.audio' | 'assistant.live' }
          >;
        }>
      ).detail;
      if (id !== meetingId) return;
      if (message.type === 'assistant.live') {
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
  if (!available) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 rounded-full"
      onClick={async () => {
        if (enabled) {
          player.current?.close();
          setEnabled(false);
        } else {
          await player.current?.unlock(outputDeviceId);
          setEnabled(true);
        }
      }}
    >
      <MiraAvatar size={18} />
      <Volume2 className="size-3.5" />
      {t(enabled ? 'room_audio_on' : 'room_audio_enable')}
    </Button>
  );
}
