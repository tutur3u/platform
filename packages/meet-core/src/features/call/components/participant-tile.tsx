'use client';
import { Hand, Volume2 } from '@tuturuuu/icons';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIdleControls } from '../hooks/use-idle-controls';
import { useRenderedHeight } from '../hooks/use-rendered-height';
import { attachMediaPlayback } from '../lib/media-playback';
import { meetParticipantName } from '../lib/participant-identity';
import { observeVideoPresentation } from '../lib/video-presentation';
import { usePhoneChrome } from '../phone/use-phone-chrome';
import { LiveAvatar } from './live-avatar';
import { useStreamReadiness } from './media-receiving-status';
import { ParticipantTileActions } from './participant-tile-actions';
import { ParticipantTileBar } from './participant-tile-bar';
import { usePlaybackVolume } from './playback-volume';

function ParticipantTileImpl({
  className,
  miraActive = false,
  outputDeviceId,
  audioSuppressed = false,
  silenced: controlledSilence,
  onSilence,
  resumePlaybackLabel,
  onPlaybackBlocked,
  handRaised,
  floating = false,
  condensed = false,
  presenceOnly = false,
  isSelf,
  isSpeaking,
  participant,
  stream,
  kind = 'camera',
  onFocus,
  onFocusView,
  onMute,
  focused,
  focusKey,
  onRenderedHeight,
  activityBadge,
}: {
  className?: string;
  miraActive?: boolean;
  outputDeviceId?: string;
  audioSuppressed?: boolean;
  silenced?: boolean;
  onSilence?: (key: string) => void;
  resumePlaybackLabel: string;
  /**
   * Phone stage: reports this tile's blocked playback with a retry (or null once
   * it clears), so the stage can offer one Play meeting audio press for all tiles.
   */
  onPlaybackBlocked?: (key: string, retry: (() => void) | null) => void;
  handRaised?: boolean;
  /** Compact chrome for the floating self-preview: no per-tile controls. */
  floating?: boolean;
  /**
   * A narrow filmstrip tile: no resume-playback chip (the large tile keeps one),
   * and the local tile reads just "You" instead of a clipped name and suffix.
   */
  condensed?: boolean;
  /** Presence-only rooms have no media, so mute and receive badges stay hidden. */
  presenceOnly?: boolean;
  isSelf?: boolean;
  isSpeaking?: boolean;
  participant: MeetRealtimePresence;
  stream?: MediaStream | null;
  kind?: 'camera' | 'screen';
  onFocus?: (key: string | null) => void;
  /** Reports when the tile enters or leaves the in-app focus view. */
  onFocusView?: (active: boolean) => void;
  onMute?: (userId: string) => void;
  focusKey?: string;
  focused?: boolean;
  /** Receives this camera tile's device-pixel height for layer selection. */
  onRenderedHeight?: (userId: string, devicePx: number | null) => void;
  /** Compact indicator of the activity this participant is currently in. */
  activityBadge?: { title: string; following?: boolean };
}) {
  const t = useTranslations('meet.call');
  const displayName = meetParticipantName(participant.displayName, participant);
  const [expanded, setExpanded] = useState(false);
  const [localSilence, setLocalSilence] = useState(false);
  const phone = usePhoneChrome();
  // Phones show the tile's actions after a tap and hide them again.
  const [tapped, setTapped] = useState(false);
  const actionsShown = phone && tapped;
  useEffect(() => {
    if (!actionsShown) return;
    const timer = window.setTimeout(() => setTapped(false), 5000);
    return () => window.clearTimeout(timer);
  }, [actionsShown]);
  const silenced = controlledSilence ?? localSilence;
  const [fullscreen, setFullscreen] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const volume = usePlaybackVolume(participant.userId);
  const tileKey = focusKey ?? `${participant.userId}:${kind}`;
  const audioRef = useRef<HTMLAudioElement>(null);
  // One retry for this tile's blocked audio; run inside a press so the browser allows it.
  const resumePlayback = useCallback(() => {
    const playing = audioRef.current?.play();
    if (playing)
      void playing.then(() => setPlaybackBlocked(false)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!onPlaybackBlocked || !playbackBlocked || isSelf) return;
    onPlaybackBlocked(tileKey, resumePlayback);
    return () => onPlaybackBlocked(tileKey, null);
  }, [isSelf, onPlaybackBlocked, playbackBlocked, resumePlayback, tileKey]);
  const videoTrack = stream?.getVideoTracks()[0];
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);
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
  const maximizeRef = useRef<HTMLButtonElement>(null);
  const exitFocusRef = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);
  const userId = participant.userId;
  const reportHeight = useMemo(
    () =>
      onRenderedHeight && kind === 'camera' && !isSelf
        ? (devicePx: number | null) => onRenderedHeight(userId, devicePx)
        : undefined,
    [onRenderedHeight, kind, isSelf, userId]
  );
  useRenderedHeight(tileRef, reportHeight);
  const videoEnabled =
    kind === 'screen'
      ? participant.media.screenEnabled
      : participant.media.videoEnabled;
  const [presentedStream, setPresentedStream] = useState<MediaStream | null>(
    null
  );
  const presentingVideo = Boolean(
    videoStream && presentedStream === videoStream
  );
  useEffect(() => {
    const video = videoRef.current;
    setPresentedStream(null);
    if (!video || !videoStream || !videoEnabled) return;
    return observeVideoPresentation(
      video,
      videoStream,
      (presenting) => setPresentedStream(presenting ? videoStream : null),
      kind === 'camera'
    );
  }, [videoStream, videoEnabled, kind]);
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === tileRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
    };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const onEscape = (event: KeyboardEvent) => {
      // Browser full screen consumes Esc itself; focus view handles the rest
      // unless another layer already handled it or a dialog/popover is open.
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.fullscreenElement
      )
        return;
      const overlays = document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], [data-radix-popper-content-wrapper]'
      );
      for (const overlay of overlays) {
        if (!overlay.contains(tileRef.current)) return;
      }
      setExpanded(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, [expanded]);
  useEffect(() => {
    if (expanded) exitFocusRef.current?.focus();
    else if (wasExpanded.current) {
      if (document.fullscreenElement === tileRef.current)
        void document.exitFullscreen().catch(() => undefined);
      maximizeRef.current?.focus();
    }
    wasExpanded.current = expanded;
  }, [expanded]);
  useEffect(() => {
    if (!onFocusView || !expanded) return;
    onFocusView(true);
    return () => onFocusView(false);
  }, [expanded, onFocusView]);
  const controlsVisible = useIdleControls(tileRef, expanded);
  const controlsHidden = expanded && !controlsVisible;
  const readiness = useStreamReadiness(stream);
  const showVideo = Boolean(
    presentingVideo &&
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
      onClick={(event) => {
        if (!phone || expanded || floating) return;
        if ((event.target as HTMLElement).closest('button, a')) return;
        setTapped((value) => !value);
      }}
      data-testid={`participant-${participant.userId}-${kind}`}
      data-focus-view={expanded || undefined}
      className={cn(
        '@container group relative isolate min-h-0 overflow-hidden rounded-2xl bg-muted/40 ring-1 ring-border',
        isSpeaking && 'ring-2 ring-dynamic-green',
        handRaised &&
          kind === 'camera' &&
          'shadow-dynamic-orange/15 shadow-lg ring-2 ring-dynamic-orange',
        className,
        expanded && 'fixed inset-0 z-50 size-full rounded-none bg-background'
      )}
    >
      <audio
        ref={audioRef}
        autoPlay
        muted={silenced || isSelf || audioSuppressed}
      />
      <video
        autoPlay
        playsInline
        muted
        ref={videoRef}
        className={cn(
          'absolute inset-0 size-full object-contain',
          !showVideo && 'opacity-0',
          isSelf && kind === 'camera' && '-scale-x-100'
        )}
      />
      {!floating && kind === 'camera' && activityBadge && (
        <div
          data-participant-activity={activityBadge.title}
          className="pointer-events-none absolute top-2 left-2 z-10 max-w-[calc(100%-3rem)] truncate rounded-full border border-border/70 bg-background/85 px-2 py-0.5 font-medium text-[11px] text-foreground backdrop-blur-sm"
          title={
            activityBadge.following
              ? t('stage_layout.following_badge', {
                  activity: activityBadge.title,
                })
              : activityBadge.title
          }
        >
          {activityBadge.following
            ? t('stage_layout.following_badge', {
                activity: activityBadge.title,
              })
            : activityBadge.title}
        </div>
      )}
      {!showVideo && (
        <div
          className={cn(
            'absolute inset-x-0 top-0 grid place-items-center',
            // Stops above the one-line name row; the avatar sizes to what is left.
            floating ? 'bottom-0 pb-7' : 'bottom-9 [container-type:size]'
          )}
        >
          {MEETING_APP === 'parley' && participant.assistantAudio ? (
            <LiveAvatar
              className={
                floating
                  ? undefined
                  : 'size-[clamp(1.5rem,calc(100cqh-0.5rem),7.5rem)]'
              }
              size={floating ? 48 : 120}
            />
          ) : (
            <Avatar
              className={
                floating
                  ? 'size-[clamp(1.75rem,calc((100cqh-1.75rem)*0.75),5rem)] text-[clamp(0.75rem,16cqh,1.25rem)]'
                  : 'size-[clamp(min(2rem,100cqh),calc(100cqh-0.5rem),5rem)] text-[clamp(0.75rem,25cqh,1.25rem)]'
              }
            >
              <AvatarImage src={participant.avatarUrl} alt="" />
              <AvatarFallback>
                {getInitials(displayName, { firstTwoWords: true }) || '?'}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
      {playbackBlocked && !isSelf && !condensed && (
        // Centred, so no corner overlay (such as the stage's join QR chip,
        // which sits at the bottom-left) can cover it. It stays inside the
        // tile; on a narrow tile it is an icon whose name is the label.
        <Button
          data-testid="tile-resume-audio"
          variant="secondary"
          className="absolute top-1/2 left-1/2 z-20 max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-1/2 @max-[12rem]:size-9 @max-[12rem]:px-0"
          onClick={resumePlayback}
        >
          <Volume2 aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate @max-[12rem]:sr-only">
            {resumePlaybackLabel}
          </span>
        </Button>
      )}
      {handRaised && kind === 'camera' && (
        <div
          role="status"
          className="motion-safe:zoom-in absolute top-3 left-3 flex items-center gap-2 rounded-full border border-dynamic-orange/50 bg-background/95 px-3 py-2 font-semibold text-dynamic-orange text-sm shadow-lg motion-safe:animate-in @max-[12rem]:top-1.5 @max-[12rem]:left-1.5 @max-[12rem]:p-1.5"
        >
          <Hand className="size-5 fill-dynamic-orange/20 @max-[12rem]:size-4" />
          <span className="@max-[12rem]:sr-only">{t('hand_raised')}</span>
        </div>
      )}
      <ParticipantTileBar
        condensed={condensed}
        controlsHidden={controlsHidden}
        displayName={displayName}
        floating={floating}
        isSelf={isSelf}
        kind={kind}
        miraActive={miraActive}
        onMute={onMute}
        participant={participant}
        presenceOnly={presenceOnly}
        receivingAudio={readiness.receivingAudio}
        receivingVideo={presentingVideo || readiness.receivingVideo}
        showVideo={showVideo}
      />
      {!floating && (
        <ParticipantTileActions
          audio={!isSelf && !!audioTrack}
          controlsHidden={controlsHidden}
          displayName={displayName}
          exitFocusRef={exitFocusRef}
          expanded={expanded}
          focusKey={focusKey ?? `${participant.userId}:${kind}`}
          focused={focused}
          fullscreen={fullscreen}
          maximizeRef={maximizeRef}
          onExpandedChange={setExpanded}
          onFocus={onFocus}
          onSilence={() =>
            onSilence
              ? onSilence(focusKey ?? `${participant.userId}:${kind}`)
              : setLocalSilence((value) => !value)
          }
          shown={actionsShown}
          silenced={silenced}
          tileRef={tileRef}
        />
      )}
    </div>
  );
}
export const ParticipantTile = memo(
  ParticipantTileImpl,
  (a, b) =>
    a.miraActive === b.miraActive &&
    a.participant.assistantAudio?.microphoneEnabled ===
      b.participant.assistantAudio?.microphoneEnabled &&
    a.participant.assistantAudio?.speakerEnabled ===
      b.participant.assistantAudio?.speakerEnabled &&
    a.participant.userId === b.participant.userId &&
    a.participant.displayName === b.participant.displayName &&
    a.participant.guest === b.participant.guest &&
    a.participant.external === b.participant.external &&
    a.participant.avatarUrl === b.participant.avatarUrl &&
    a.participant.media.audioEnabled === b.participant.media.audioEnabled &&
    a.participant.media.videoEnabled === b.participant.media.videoEnabled &&
    a.participant.media.screenEnabled === b.participant.media.screenEnabled &&
    a.handRaised === b.handRaised &&
    a.isSelf === b.isSelf &&
    a.floating === b.floating &&
    a.condensed === b.condensed &&
    a.presenceOnly === b.presenceOnly &&
    a.isSpeaking === b.isSpeaking &&
    a.stream === b.stream &&
    a.className === b.className &&
    a.outputDeviceId === b.outputDeviceId &&
    a.audioSuppressed === b.audioSuppressed &&
    a.silenced === b.silenced &&
    a.onSilence === b.onSilence &&
    a.resumePlaybackLabel === b.resumePlaybackLabel &&
    a.onPlaybackBlocked === b.onPlaybackBlocked &&
    a.kind === b.kind &&
    a.focused === b.focused &&
    a.focusKey === b.focusKey &&
    a.onFocus === b.onFocus &&
    a.onFocusView === b.onFocusView &&
    a.onMute === b.onMute
);
