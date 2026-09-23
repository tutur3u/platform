'use client';
import { Mic, MicOff, Square, Volume2, VolumeX } from '@tuturuuu/icons';
import { controlMeetLive } from '@tuturuuu/internal-api';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MiraAvatar } from '../call/components/mira-profile';
import {
  MIRA_VOLUME_ID,
  usePlaybackVolume,
} from '../call/components/playback-volume';
import type { MeetRoomController } from '../call/lib/room-controller';
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
      'ready',
    ].includes(message.type)
  )
    return false;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { meetingId, message } })
  );
  return message.type !== 'room.ended' && message.type !== 'ready';
}
export function RoomAssistantAudio({
  meetingId,
  outputDeviceId,
  canManage = false,
  room,
  audioSuppressed = false,
}: {
  meetingId: string;
  outputDeviceId: string;
  canManage?: boolean;
  room: MeetRoomController;
  audioSuppressed?: boolean;
}) {
  const volume = usePlaybackVolume(MIRA_VOLUME_ID);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const t = useTranslations('meet.live');
  const currentSessionId = room.state.liveAssistant?.sessionId;
  const [microphoneChoice, setMicrophoneChoice] = useState<{
    sessionId: string;
    enabled: boolean;
  }>();
  const microphoneEnabled =
    !!currentSessionId &&
    microphoneChoice?.sessionId === currentSessionId &&
    microphoneChoice.enabled;
  const wantsAudio = useRef(true);
  const playbackOptions = useRef({ audioSuppressed, outputDeviceId });
  playbackOptions.current = { audioSuppressed, outputDeviceId };
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [stopping, setStopping] = useState(false);
  const player = useRef<RoomAudioPlayers | null>(null);
  const resumeListening = useRef(() => {});
  useEffect(() => {
    const audio = new RoomAudioPlayers(() => {
      audio.mute();
      setEnabled(false);
      toast.error(t('session_error'));
    });
    audio.setVolume(volumeRef.current);
    player.current = audio;
    setEnabled(false);
    let disposed = false;
    const autoListen = () => {
      const options = playbackOptions.current;
      if (!wantsAudio.current || options.audioSuppressed) return;
      void audio
        .unlock(options.outputDeviceId)
        .then((ready) => {
          if (
            !disposed &&
            ready &&
            wantsAudio.current &&
            !playbackOptions.current.audioSuppressed
          )
            setEnabled(true);
        })
        .catch(() => {
          if (!disposed) setEnabled(false);
        });
    };
    const sequences = new Map<string, number>();
    const clockOffsets = new Map<string, number>();
    const initial = [...(announcements.get(meetingId)?.values() ?? [])];
    const liveSessions = new Set(initial.map((item) => item.sessionId));
    resumeListening.current = () => {
      if (liveSessions.size) autoListen();
    };
    for (const id of liveSessions) audio.activate(id);
    if (liveSessions.size) autoListen();
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
                | 'ready';
            }
          >;
        }>
      ).detail;
      if (id !== meetingId) return;
      if (message.type === 'room.ended' || message.type === 'ready') {
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
          autoListen();
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
      disposed = true;
      resumeListening.current = () => {};
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
  useEffect(() => {
    room.setAssistantAudio({
      sessionId: currentSessionId,
      microphoneEnabled,
      speakerEnabled: enabled && volume > 0,
    });
  }, [
    enabled,
    volume,
    microphoneEnabled,
    currentSessionId,
    room.setAssistantAudio,
  ]);
  useEffect(() => {
    if (audioSuppressed) {
      player.current?.mute();
      setEnabled(false);
    } else resumeListening.current();
  }, [audioSuppressed]);
  useEffect(() => {
    player.current?.setVolume(volume);
  }, [volume]);
  if (!available) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {currentSessionId && (
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          aria-pressed={microphoneEnabled}
          title={t('mic_control_hint')}
          onClick={() =>
            setMicrophoneChoice({
              sessionId: currentSessionId,
              enabled: !microphoneEnabled,
            })
          }
        >
          {microphoneEnabled ? (
            <Mic className="size-3.5" />
          ) : (
            <MicOff className="size-3.5" />
          )}
          {t(microphoneEnabled ? 'mute_to_mira' : 'unmute_to_mira')}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="gap-2 rounded-full"
        disabled={audioSuppressed}
        aria-pressed={enabled}
        onClick={async () => {
          if (enabled) {
            wantsAudio.current = false;
            player.current?.mute();
            setEnabled(false);
          } else {
            wantsAudio.current = true;
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
        {enabled ? (
          <Volume2 className="size-3.5" />
        ) : (
          <VolumeX className="size-3.5" />
        )}
        {t(enabled ? 'deafen_mira' : 'room_audio_enable')}
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
