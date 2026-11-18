'use client';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useLargeRoomLabels } from '../lib/large-room-labels';
import { attachMediaPlayback } from '../lib/media-playback';
import { orderStageTiles } from '../lib/negotiation';
import { usePlaybackVolume } from './playback-volume';
import type { MeetRoomController } from '../lib/room-controller';
import { MiraParticipant } from './mira-participant';
import { ParticipantTile } from './participant-tile';
export type CallLayout = 'auto' | 'grid' | 'spotlight' | 'sidebar';
type Tile = {
  key: string;
  userId: string;
  participant: MeetRealtimePresence;
  kind: 'camera' | 'screen';
  stream: MediaStream | null;
};
function columns(count: number) {
  if (count < 2) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
  return count <= 9
    ? 'grid-cols-2 lg:grid-cols-3'
    : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}
export function CallStage({
  room,
  outputDeviceId,
  audioSuppressed = false,
  layout,
  compact = false,
  hideSelfCamera = false,
  focus,
  onFocus,
  onChat,
}: {
  room: MeetRoomController;
  outputDeviceId?: string;
  audioSuppressed?: boolean;
  layout: CallLayout;
  compact?: boolean;
  /** Omit the local camera tile when it renders as a floating preview. */
  hideSelfCamera?: boolean;
  focus: string | null;
  onFocus: (key: string | null) => void;
  onChat: () => void;
}) {
  const t = useTranslations('meet.call');
  const labels = useLargeRoomLabels();
  const mobile = useSyncExternalStore(
    watchCompactStage,
    isCompactStage,
    () => false
  );
  const [requestedPage, setPage] = useState(0);
  const [blockedAudio, setBlockedAudio] = useState<Set<string>>(
    () => new Set()
  );
  const onAudioBlocked = useCallback((key: string, blocked: boolean) => {
    setBlockedAudio((current) => {
      if (current.has(key) === blocked) return current;
      const next = new Set(current);
      if (blocked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const [silenced, setSilenced] = useState<Set<string>>(() => new Set());
  const toggleSilence = useCallback((key: string) => {
    setSilenced((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const mute = useCallback(
    (userId: string) => room.muteParticipant(userId, ['audio']),
    [room.muteParticipant]
  );
  const cache = useRef(new Map<string, MediaStream>());
  const tiles = useMemo(() => {
    const result: Tile[] = [];
    const streamFor = (
      key: string,
      tracks: (MediaStreamTrack | undefined)[]
    ) => {
      const selected = tracks.filter((track): track is MediaStreamTrack =>
        Boolean(track)
      );
      if (!selected.length) return null;
      let current = cache.current.get(key);
      if (
        !current ||
        current.getTracks().length !== selected.length ||
        selected.some((track) => !current?.getTracks().includes(track))
      ) {
        current = new MediaStream(selected);
        cache.current.set(key, current);
      }
      return current;
    };
    for (const participant of Object.values(room.state.participants)) {
      const self = participant.userId === room.state.selfUserId;
      const remote = room.remoteMedia[participant.userId];
      const key = `${participant.userId}:camera`;
      if (!(self && hideSelfCamera))
        result.push({
          key,
          participant,
          userId: participant.userId,
          kind: 'camera',
          stream: self
            ? room.localStream
            : streamFor(key, [remote?.audio, remote?.video]),
        });
      if (participant.media.screenEnabled) {
        const screenKey = `${participant.userId}:screen`;
        result.push({
          key: screenKey,
          participant,
          userId: participant.userId,
          kind: 'screen',
          stream: self
            ? room.screenStream
            : streamFor(screenKey, [remote?.screen, remote?.screen_audio]),
        });
      }
    }
    const keys = new Set(result.map((tile) => tile.key));
    for (const key of cache.current.keys())
      if (!keys.has(key)) cache.current.delete(key);
    return result;
  }, [
    room.state.participants,
    room.state.selfUserId,
    room.remoteMedia,
    room.localStream,
    room.screenStream,
    hideSelfCamera,
  ]);
  const mira = room.state.liveAssistant;
  const renderMira = (className: string, compact = false) =>
    mira ? (
      <MiraParticipant
        sessionId={mira.sessionId}
        compact={compact}
        className={compact ? 'aspect-video w-40 shrink-0 lg:w-full' : className}
        focused={focus === 'mira'}
        onFocus={() => onFocus(focus === 'mira' ? null : 'mira')}
        onChat={onChat}
      />
    ) : null;
  const size = compact || mobile ? 9 : 12;
  const pageCount = Math.max(1, Math.ceil(tiles.length / size));
  const page = Math.min(requestedPage, pageCount - 1);
  const ordered =
    pageCount > 1
      ? orderStageTiles(tiles, focus, [
          ...(room.state.stage.activeSpeakerIds ?? []),
          ...(room.state.recentSpeakerIds ?? []),
        ])
      : tiles;
  const visible = ordered.slice(page * size, (page + 1) * size);
  const paged = pageCount > 1;
  const explicitFocus = visible.find((tile) => tile.key === focus);
  const focused =
    explicitFocus ??
    visible.find((tile) => tile.kind === 'screen') ??
    visible.find((tile) => tile.participant.userId !== room.state.selfUserId) ??
    visible[0];
  const spotlight =
    (layout === 'spotlight' &&
      (!focus || !!explicitFocus || (focus === 'mira' && !!mira))) ||
    layout === 'sidebar' ||
    (layout === 'auto' &&
      (explicitFocus || visible.some((tile) => tile.kind === 'screen')));
  const cameraIds = [
    ...visible
      .filter((tile) => tile.kind === 'camera')
      .map((tile) => tile.userId),
    ...ordered
      .filter((tile) => tile.key === focus && tile.kind === 'camera')
      .map((tile) => tile.userId),
  ];
  const cameraWindow = [...new Set(cameraIds)].sort().join(',');
  const spotlightUserId =
    spotlight && focused?.kind === 'camera' ? focused.userId : undefined;
  useEffect(() => {
    room.setStageVideoWindow?.(
      cameraWindow ? cameraWindow.split(',') : [],
      spotlightUserId
    );
  }, [cameraWindow, room.setStageVideoWindow, spotlightUserId]);

  const focusTile = useCallback(
    (key: string | null) => {
      if (key && paged) setPage(0);
      onFocus(key);
    },
    [onFocus, paged]
  );
  const render = (tile: Tile, className: string) => (
    <ParticipantTile
      miraActive={!!mira}
      outputDeviceId={outputDeviceId}
      audioSuppressed={audioSuppressed || paged}
      silenced={silenced.has(tile.key)}
      onSilence={toggleSilence}
      key={tile.key}
      className={compact ? 'aspect-video w-40 shrink-0 lg:w-full' : className}
      kind={tile.kind}
      participant={tile.participant}
      stream={tile.stream}
      isSelf={tile.participant.userId === room.state.selfUserId}
      handRaised={room.state.stage.raisedHandUserIds.includes(
        tile.participant.userId
      )}
      resumePlaybackLabel={t('resume_audio')}
      focused={focus === tile.key}
      focusKey={tile.key}
      onFocus={focusTile}
      onRetry={room.reconnectReceivingMedia}
      onMute={
        (room.state.canManageParticipants ?? room.state.role === 'host')
          ? mute
          : undefined
      }
    />
  );
  const focusedKey = focus === 'mira' && mira ? 'mira' : focused?.key;
  const count = visible.length + (mira ? 1 : 0);
  const tileClass = (key: string) => {
    if (compact) return 'aspect-video w-40 shrink-0 lg:w-full';
    if (!spotlight) return 'min-h-32';
    const primary = key === focusedKey;
    return cn(
      primary ? 'order-first col-span-full min-h-0' : 'min-h-0',
      layout === 'sidebar' &&
        (primary ? 'lg:col-span-1 lg:row-span-full' : 'lg:col-start-2')
    );
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      {paged && (
        <nav
          aria-label={labels('stage_pages')}
          className="flex shrink-0 items-center justify-center gap-2 pb-1"
        >
          <Button
            size="sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {labels('previous_page')}
          </Button>
          <span
            aria-live="polite"
            className="whitespace-nowrap text-sm tabular-nums"
          >
            {labels('stage_page', { page: page + 1, count: pageCount })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page + 1 === pageCount}
            onClick={() => setPage(page + 1)}
          >
            {labels('next_page')}
          </Button>
        </nav>
      )}
      {paged &&
        Object.entries(room.remoteMedia)
          .flatMap(([userId, tracks]) =>
            (['audio', 'screen_audio'] as const).flatMap((kind) =>
              tracks[kind]
                ? [
                    {
                      userId,
                      track: tracks[kind],
                      key: `${userId}:${kind === 'audio' ? 'camera' : 'screen'}`,
                    },
                  ]
                : []
            )
          )
          .map((tile) => (
            <StageAudio
              key={tile.key}
              id={tile.key}
              userId={tile.userId}
              track={tile.track}
              muted={audioSuppressed || silenced.has(tile.key)}
              outputDeviceId={outputDeviceId}
              onBlocked={onAudioBlocked}
            />
          ))}
      {paged && blockedAudio.size > 0 && (
        <Button
          size="sm"
          className="mx-auto shrink-0"
          variant="outline"
          onClick={(event) => {
            for (const audio of event.currentTarget.parentElement?.querySelectorAll(
              'audio[data-stage-audio]'
            ) ?? [])
              if (audio instanceof HTMLAudioElement)
                void audio.play().catch(() => undefined);
          }}
        >
          {t('resume_audio')}
        </Button>
      )}
      <div
        style={{ '--stage-rows': Math.max(1, count - 1) } as CSSProperties}
        className={cn(
          'grid flex-1 min-h-0 gap-3 overflow-auto p-1',
          compact
            ? 'flex gap-2 lg:flex-col'
            : spotlight
              ? 'auto-rows-[8rem] grid-cols-2 grid-rows-[minmax(0,1fr)]'
              : cn('auto-rows-[minmax(8rem,1fr)]', columns(count)),
          !compact &&
            spotlight &&
            layout === 'sidebar' &&
            'lg:grid-cols-[minmax(0,1fr)_13rem] lg:grid-rows-[repeat(var(--stage-rows),minmax(0,1fr))]'
        )}
      >
        {visible.map((tile) => render(tile, tileClass(tile.key)))}
        {renderMira(tileClass('mira'), compact)}
      </div>
    </div>
  );
}

function StageAudio({
  id,
  userId,
  track,
  muted,
  outputDeviceId,
  onBlocked,
}: {
  id: string;
  userId: string;
  track: MediaStreamTrack | undefined;
  muted: boolean;
  outputDeviceId?: string;
  onBlocked: (id: string, blocked: boolean) => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const volume = usePlaybackVolume(userId);
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    const audio = ref.current;
    if (!audio || !track) return;
    const detach = attachMediaPlayback(
      audio,
      new MediaStream([track]),
      (blocked) => onBlocked(id, blocked)
    );
    return () => {
      detach();
      audio.srcObject = null;
      onBlocked(id, false);
    };
  }, [id, onBlocked, track]);
  useEffect(() => {
    const audio = ref.current;
    if (audio && outputDeviceId !== undefined && 'setSinkId' in audio)
      void audio.setSinkId(outputDeviceId).catch(() => onBlocked(id, true));
  }, [id, onBlocked, outputDeviceId]);
  return <audio ref={ref} data-stage-audio autoPlay muted={muted} />;
}

function isCompactStage() {
  return window.matchMedia?.('(max-width: 1023px)').matches ?? false;
}
function watchCompactStage(recheck: () => void) {
  const query = window.matchMedia?.('(max-width: 1023px)');
  query?.addEventListener('change', recheck);
  return () => query?.removeEventListener('change', recheck);
}
