'use client';
import {
  Hand,
  Maximize,
  MicOff,
  Minimize,
  MonitorUp,
  Pin,
  RefreshCw,
} from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { attachMediaPlayback } from '../lib/media-playback';
import {
  MediaReceivingStatus,
  useStreamReadiness,
} from './media-receiving-status';

function ParticipantTileImpl({
  className,
  outputDeviceId,
  resumePlaybackLabel,
  handRaised,
  isSelf,
  isSpeaking,
  participant,
  stream,
  kind = 'camera',
  onFocus,
  onMute,
  onRetry,
  focused,
  focusKey,
}: {
  className?: string;
  outputDeviceId?: string;
  resumePlaybackLabel: string;
  handRaised?: boolean;
  isSelf?: boolean;
  isSpeaking?: boolean;
  participant: MeetRealtimePresence;
  stream?: MediaStream | null;
  kind?: 'camera' | 'screen';
  onFocus?: (key: string | null) => void;
  onMute?: (userId: string) => void;
  onRetry?: () => void;
  focusKey?: string;
  focused?: boolean;
}) {
  const t = useTranslations('meet.call');
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoTrack = stream?.getVideoTracks()[0];
  const audioTrack = !isSelf ? stream?.getAudioTracks()[0] : undefined;
  const videoStream = useMemo(
    () => (videoTrack ? new MediaStream([videoTrack]) : null),
    [videoTrack]
  );
  const audioStream = useMemo(
    () => (audioTrack ? new MediaStream([audioTrack]) : null),
    [audioTrack]
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === tileRef.current);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);
  const readiness = useStreamReadiness(stream);
  const showVideo = Boolean(
    readiness.video &&
      (kind === 'screen'
        ? participant.media.screenEnabled
        : participant.media.videoEnabled)
  );
  useEffect(() => {
    const element = videoRef.current;
    if (element)
      return attachMediaPlayback(element, videoStream, () => undefined);
  }, [videoStream]);
  useEffect(() => {
    if (audioRef.current)
      return attachMediaPlayback(
        audioRef.current,
        audioStream,
        setPlaybackBlocked
      );
  }, [audioStream]);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && outputDeviceId !== undefined && 'setSinkId' in audio)
      void audio
        .setSinkId(outputDeviceId)
        .catch(() => setPlaybackBlocked(true));
  }, [outputDeviceId]);
  return (
    <div
      ref={tileRef}
      className={cn(
        'group relative isolate min-h-0 overflow-hidden rounded-2xl bg-dynamic-surface ring-1 ring-border',
        isSpeaking && 'ring-2 ring-dynamic-green',
        handRaised &&
          kind === 'camera' &&
          'shadow-dynamic-orange/15 shadow-lg ring-2 ring-dynamic-orange',
        className,
        expanded && 'fixed inset-0 z-50 h-dvh w-screen! rounded-none'
      )}
    >
      <audio ref={audioRef} autoPlay />
      <video
        autoPlay
        playsInline
        muted
        ref={videoRef}
        className={cn(
          'absolute inset-0 size-full object-contain',
          isSelf && kind === 'camera' && '-scale-x-100'
        )}
      />
      {!showVideo && (
        <div className="absolute inset-0 grid size-full place-items-center bg-dynamic-surface">
          <Avatar className="size-20 text-xl">
            <AvatarImage src={participant.avatarUrl} alt="" />
            <AvatarFallback>
              {participant.displayName
                .split(/\s+/u)
                .slice(0, 2)
                .map((name) => name[0]?.toUpperCase())
                .join('')}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      {playbackBlocked && !isSelf && (
        <Button
          variant="secondary"
          className="absolute bottom-16 left-3 z-20"
          onClick={() => {
            void audioRef.current
              ?.play()
              .then(() => setPlaybackBlocked(false))
              .catch(() => undefined);
          }}
        >
          {resumePlaybackLabel}
        </Button>
      )}
      {!isSelf &&
        !showVideo &&
        (kind === 'screen'
          ? participant.media.screenEnabled
          : participant.media.videoEnabled) &&
        onRetry && (
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-16 left-1/2 -translate-x-1/2"
            onClick={onRetry}
          >
            <RefreshCw className="size-3.5" />
            {t('retry_video')}
          </Button>
        )}
      {handRaised && kind === 'camera' && (
        <div
          role="status"
          className="motion-safe:zoom-in absolute top-3 left-3 flex items-center gap-2 rounded-full border border-dynamic-orange/50 bg-background/95 px-3 py-2 font-semibold text-dynamic-orange text-sm shadow-lg motion-safe:animate-in"
        >
          <Hand className="size-5 fill-dynamic-orange/20" />
          {t('hand_raised')}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 py-3 text-white">
        {kind === 'screen' && (
          <MonitorUp
            aria-label={t('sharing_screen')}
            className="size-4 shrink-0"
          />
        )}
        <span className="min-w-0 truncate font-medium text-sm">
          {participant.displayName}
          {isSelf ? ` · ${t('you')}` : ''}
        </span>
        {!isSelf && (
          <MediaReceivingStatus
            audio={readiness.receivingAudio}
            video={readiness.receivingVideo}
            expectAudio={kind === 'camera' && participant.media.audioEnabled}
            expectVideo={
              kind === 'camera'
                ? participant.media.videoEnabled
                : participant.media.screenEnabled
            }
          />
        )}
        {!participant.media.audioEnabled && kind === 'camera' && (
          <MicOff aria-label={t('muted')} className="size-3.5 shrink-0" />
        )}
        {onMute &&
          !isSelf &&
          kind === 'camera' &&
          participant.media.audioEnabled && (
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto size-8 shrink-0 rounded-full bg-background/30 text-white opacity-100 hover:bg-background/60 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
              aria-label={t('mute_participant', {
                name: participant.displayName,
              })}
              onClick={() => onMute(participant.userId)}
            >
              <MicOff className="size-4" />
            </Button>
          )}
      </div>
      <div className="absolute top-2 right-2 flex gap-1 rounded-lg bg-background/80 p-1 opacity-100 backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        {onFocus && (
          <Button
            size="icon"
            variant={focused ? 'secondary' : 'ghost'}
            className="size-8"
            aria-label={focused ? t('unfocus_feed') : t('focus_feed')}
            aria-pressed={focused}
            onClick={() =>
              onFocus(
                focused ? null : (focusKey ?? `${participant.userId}:${kind}`)
              )
            }
          >
            <Pin className="size-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={t(
            expanded || fullscreen ? 'exit_fullscreen' : 'fullscreen_feed'
          )}
          onClick={() => {
            if (expanded) {
              setExpanded(false);
              return;
            }
            if (fullscreen) {
              void document.exitFullscreen();
              return;
            }
            const tile = tileRef.current;
            if (!tile?.requestFullscreen) {
              setExpanded(true);
              return;
            }
            void tile.requestFullscreen().catch(() => setExpanded(true));
          }}
        >
          {expanded || fullscreen ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
export const ParticipantTile = memo(
  ParticipantTileImpl,
  (a, b) =>
    a.participant.userId === b.participant.userId &&
    a.participant.displayName === b.participant.displayName &&
    a.participant.avatarUrl === b.participant.avatarUrl &&
    a.participant.media.audioEnabled === b.participant.media.audioEnabled &&
    a.participant.media.videoEnabled === b.participant.media.videoEnabled &&
    a.participant.media.screenEnabled === b.participant.media.screenEnabled &&
    a.handRaised === b.handRaised &&
    a.isSelf === b.isSelf &&
    a.isSpeaking === b.isSpeaking &&
    a.stream === b.stream &&
    a.className === b.className &&
    a.outputDeviceId === b.outputDeviceId &&
    a.resumePlaybackLabel === b.resumePlaybackLabel &&
    a.kind === b.kind &&
    a.focused === b.focused &&
    a.focusKey === b.focusKey &&
    a.onFocus === b.onFocus &&
    a.onMute === b.onMute &&
    a.onRetry === b.onRetry
);
