'use client';
import { Square, Volume2 } from '@tuturuuu/icons';
import { controlMeetLive } from '@tuturuuu/internal-api';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MiraAvatar } from '../call/components/mira-profile';
import { RoomAudioPlayers } from './room-players';

const EVENT = 'meet:assistant-audio';
type Announcement = Extract<
  MeetRealtimeServerMessage,
  { type: 'assistant.live' | 'assistant.share' }
>;
const announcements = new Map<string, Map<string, Announcement>>();
export function deliverRoomAssistantAudio(
  meetingId: string,
  message: MeetRealtimeServerMessage
) {
  if (
    message.type === 'admission.approved' ||
    message.type === 'room.ended' ||
    (message.type === 'ready' && message.admission === 'admitted')
  )
    announcements.delete(meetingId);
  if (message.type === 'assistant.live' || message.type === 'assistant.share') {
    const current =
      announcements.get(meetingId) ?? new Map<string, Announcement>();
    if (message.active) current.set(message.sessionId, message);
    else current.delete(message.sessionId);
    announcements.set(meetingId, current);
  }
  if (
    ![
      'assistant.audio',
      'assistant.live',
      'assistant.share',
      'assistant.interrupted',
      'room.ended',
      'admission.approved',
      'ready',
    ].includes(message.type)
  )
    return false;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { meetingId, message } })
  );
  return (
    message.type !== 'room.ended' &&
    message.type !== 'admission.approved' &&
    message.type !== 'ready'
  );
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
  const player = useRef<RoomAudioPlayers | null>(null);
  useEffect(() => {
    const audio = new RoomAudioPlayers(() => {
      audio.mute();
      setEnabled(false);
      toast.error(t('session_error'));
    });
    player.current = audio;
    setEnabled(false);
    const sequences = new Map<string, number>();
    const clockOffsets = new Map<string, number>();
    const initial = [...(announcements.get(meetingId)?.values() ?? [])];
    const liveSessions = new Set(initial.map((item) => item.sessionId));
    for (const id of liveSessions) audio.activate(id);
    setAvailable(liveSessions.size > 0);
    setSessionId(
      initial.find((item) => item.type === 'assistant.live')?.sessionId
    );
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
                | 'assistant.share'
                | 'assistant.interrupted'
                | 'room.ended'
                | 'admission.approved'
                | 'ready';
            }
          >;
        }>
      ).detail;
      if (id !== meetingId) return;
      if (
        message.type === 'room.ended' ||
        message.type === 'admission.approved' ||
        message.type === 'ready'
      ) {
        liveSessions.clear();
        audio.clear();
        setEnabled(false);
        setAvailable(false);
        setSessionId(undefined);
        return;
      }
      if (message.type === 'assistant.interrupted') {
        audio.interrupt(message.sessionId);
        return;
      }
      if (
        message.type === 'assistant.live' ||
        message.type === 'assistant.share'
      ) {
        if (message.active) {
          liveSessions.add(message.sessionId);
          audio.activate(message.sessionId);
        } else {
          liveSessions.delete(message.sessionId);
          audio.deactivate(message.sessionId);
        }
        if (message.type === 'assistant.live')
          setSessionId(message.active ? message.sessionId : undefined);
        setAvailable(liveSessions.size > 0);
        return;
      }
      const offset = Math.min(
        clockOffsets.get(message.sessionId) ?? Infinity,
        Date.now() - message.at
      );
      clockOffsets.set(message.sessionId, offset);
      if (
        Math.abs(Date.now() - message.at - offset) > 5000 ||
        message.sequence <= (sequences.get(message.sessionId) ?? -1)
      )
        return;
      sequences.set(message.sessionId, message.sequence);
      if (!liveSessions.has(message.sessionId)) return;
      audio.play(message.sessionId, message.data);
    };
    window.addEventListener(EVENT, listener);
    return () => {
      window.removeEventListener(EVENT, listener);
      audio.clear();
    };
  }, [meetingId, t]);
  useEffect(() => {
    if (enabled)
      void player.current?.unlock(outputDeviceId).catch(() => {
        setEnabled(false);
        toast.error(t('session_error'));
      });
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
            player.current?.mute();
            setEnabled(false);
          } else {
            try {
              if (await player.current?.unlock(outputDeviceId))
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
              player.current?.deactivate(sessionId);
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
