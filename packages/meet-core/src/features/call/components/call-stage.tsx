'use client';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { IncomingVideoStatus } from './incoming-video-status';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
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
import { CallResizeHandle } from './call-resize-handle';
import { MiraParticipant } from './mira-participant';
import { ParticipantTile } from './participant-tile';
import { fitTileGrid, useElementSize } from './stage-grid-fit';
export type CallLayout = 'auto' | 'grid' | 'spotlight' | 'sidebar';
const FIXED_STRIP_TILE = 'aspect-video w-40 shrink-0 lg:w-full';
const densities = ['auto', 'large', 'compact'] as const;
type GridDensity = (typeof densities)[number];

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
  selfInGrid,
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
  /**
   * Show the local camera as a tile in the same grid as everyone else. When
   * omitted it follows `!hideSelfCamera`, so existing callers are unchanged.
   */
  selfInGrid?: boolean;
  focus: string | null;
  onFocus: (key: string | null) => void;
  onChat: () => void;
}) {
  const t = useTranslations('meet.call');
  const labels = useLargeRoomLabels();
  const mobile = useCompactStage();
  const stageId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const stageSize = useElementSize(gridRef);
  const showSelf = selfInGrid ?? !hideSelfCamera;
  const [density, setDensity] = useState<GridDensity>('auto');
  const [filmstripWidth, setFilmstripWidth] = useState(25);
  const [spotlightHeight, setSpotlightHeight] = useState(70);
  const [shareHeight, setShareHeight] = useState(78);
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
      if (!self || showSelf)
        result.push({
          key,
          participant,
          userId: participant.userId,
          kind: 'camera',
          stream: self
            ? room.localStream
            : streamFor(key, [remote?.audio, remote?.video]),
        });
      if (participant.media.screenEnabled || (self && room.screenStream)) {
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
    showSelf,
  ]);
  const share =
    tiles.find((tile) => tile.kind === 'screen' && tile.key === focus) ??
    tiles.find((tile) => tile.kind === 'screen');
  const mira = room.state.liveAssistant;
  const renderMira = (className: string, compact = false) =>
    mira ? (
      <MiraParticipant
        sessionId={mira.sessionId}
        compact={compact}
        className={compact && !fit ? FIXED_STRIP_TILE : className}
        focused={!share && focus === 'mira'}
        onFocus={
          share ? undefined : () => onFocus(focus === 'mira' ? null : 'mira')
        }
        onChat={onChat}
      />
    ) : null;
  const pageSize = (compact || mobile ? 9 : 12) - Number(!!share);
  const pageCount = Math.max(
    1,
    Math.ceil((tiles.length - Number(!!share)) / pageSize)
  );
  const page = Math.min(requestedPage, pageCount - 1);
  const ordered =
    pageCount > 1
      ? orderStageTiles(tiles, focus, [
          ...(room.state.stage.activeSpeakerIds ?? []),
          ...(room.state.recentSpeakerIds ?? []),
        ])
      : tiles;
  const others = ordered.filter((tile) => tile.key !== share?.key);
  const pageTiles = others.slice(page * pageSize, (page + 1) * pageSize);
  const visible = share ? [share, ...pageTiles] : pageTiles;
  const paged = pageCount > 1;
  const explicitFocus = visible.find((tile) => tile.key === focus);
  const focused =
    share ??
    explicitFocus ??
    visible.find((tile) => tile.participant.userId !== room.state.selfUserId) ??
    visible[0];
  const spotlight =
    !!share ||
    (layout === 'spotlight' &&
      (!focus || !!explicitFocus || (focus === 'mira' && !!mira))) ||
    layout === 'sidebar' ||
    (layout === 'auto' && !!explicitFocus);
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

  // Size containment would confine a fixed focus view to the stage rect.
  const [focusView, setFocusView] = useState(false);
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
      className={cn(
        compact && !fit ? FIXED_STRIP_TILE : className,
        share && tile.kind === 'camera' && '[&_video]:object-cover'
      )}
      kind={tile.kind}
      participant={tile.participant}
      stream={tile.stream}
      isSelf={tile.participant.userId === room.state.selfUserId}
      presenceOnly={room.state.settings.transport === 'presence'}
      handRaised={room.state.stage.raisedHandUserIds.includes(
        tile.participant.userId
      )}
      resumePlaybackLabel={t('resume_audio')}
      focused={(!share || tile.kind === 'screen') && focus === tile.key}
      focusKey={tile.key}
      onFocus={share && tile.kind === 'camera' ? undefined : focusTile}
      onFocusView={setFocusView}
      onRenderedHeight={room.reportTileHeight}
      onMute={
        (room.state.canManageParticipants ?? room.state.role === 'host')
          ? mute
          : undefined
      }
    />
  );
  const focusedKey =
    share?.key ?? (focus === 'mira' && mira ? 'mira' : focused?.key);
  const count = visible.length + (mira ? 1 : 0);
  const split = !compact && spotlight && !!focusedKey && count > 1;
  const sidebar = split && layout === 'sidebar' && !mobile;
  const horizontalStrip = split && !!share && !sidebar;
  const featuredHeight = share ? shareHeight : spotlightHeight;
  const fitted = compact || (!spotlight && density === 'auto');
  const fit =
    fitted && stageSize
      ? fitTileGrid({
          count,
          width: stageSize.width,
          height: stageSize.height,
          gap: compact ? 8 : 12,
          minWidth: compact ? 112 : 160,
        })
      : null;
  const tileClass = (key: string) => {
    if (fit) return 'h-(--tile-h) w-(--tile-w) shrink-0';
    if (compact) return FIXED_STRIP_TILE;
    if (!spotlight) return density === 'compact' ? 'min-h-24' : 'min-h-32';
    if (key === focusedKey)
      return sidebar
        ? 'order-[-2] col-start-1 row-span-full min-h-0'
        : cn(
            'order-[-2] col-span-full min-h-0',
            horizontalStrip && 'sticky left-1 z-10 w-[calc(100cqw-0.5rem)]'
          );
    if (sidebar) return 'col-start-3 min-h-0';
    return horizontalStrip ? 'row-start-3 min-h-0' : 'min-h-0';
  };
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col',
        !focusView && '[container-type:size]'
      )}
    >
      <IncomingVideoStatus status={room.receiveStatus} />
      {!compact && !spotlight && count > 1 && (
        <div className="flex shrink-0 justify-end p-1">
          <Select
            value={density}
            onValueChange={(value) => setDensity(value as GridDensity)}
          >
            <SelectTrigger
              aria-label={t('tile_size')}
              className="h-7 w-auto gap-2"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {densities.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`tile_size_${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
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
        id={stageId}
        ref={gridRef}
        style={
          {
            ...(fit && {
              '--tile-w': `${fit.tileWidth}px`,
              '--tile-h': `${fit.tileHeight}px`,
            }),
            '--stage-rows': Math.max(1, count - 1),
            '--stage-rail': `${filmstripWidth}%`,
            '--stage-primary': `${featuredHeight}%`,
          } as CSSProperties
        }
        className={cn(
          'min-h-0 flex-1 overflow-auto p-1',
          fit
            ? cn(
                'flex flex-wrap justify-center',
                compact ? 'gap-2' : 'gap-3',
                fit.scroll ? 'content-start' : 'content-center'
              )
            : cn('grid gap-3', compact && 'flex gap-2 lg:flex-col'),
          !compact &&
            spotlight &&
            (sidebar
              ? 'grid-cols-[minmax(0,1fr)_0.5rem_var(--stage-rail)] grid-rows-[repeat(var(--stage-rows),minmax(5rem,1fr))] gap-2'
              : horizontalStrip
                ? 'grid-cols-[repeat(var(--stage-rows),minmax(9rem,1fr))] grid-rows-[minmax(0,min(var(--stage-primary),calc(100%-5rem)))_0.5rem_minmax(4.5rem,1fr)] gap-2'
                : cn(
                    'auto-rows-[8rem] grid-cols-2',
                    split
                      ? 'grid-rows-[minmax(0,var(--stage-primary))_0.5rem] gap-2'
                      : 'grid-rows-[minmax(0,1fr)]'
                  )),
          !fit &&
            !compact &&
            !spotlight &&
            (density === 'auto'
              ? cn('auto-rows-[minmax(8rem,1fr)]', columns(count))
              : density === 'large'
                ? 'auto-rows-[minmax(8rem,1fr)] grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))]'
                : 'auto-rows-[minmax(6rem,1fr)] grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]')
        )}
      >
        {split && (
          <CallResizeHandle
            label={t('resize_filmstrip')}
            controls={stageId}
            axis={sidebar ? 'x' : 'y'}
            size={sidebar ? filmstripWidth : featuredHeight}
            min={sidebar ? 15 : share ? 45 : 30}
            max={sidebar ? 45 : 80}
            initial={sidebar ? 25 : share ? 78 : 70}
            onResize={
              sidebar
                ? setFilmstripWidth
                : share
                  ? setShareHeight
                  : setSpotlightHeight
            }
            reverse={sidebar}
            percent
            className={cn(
              'relative order-[-1]',
              sidebar ? 'col-start-2 row-span-full' : 'col-span-full',
              horizontalStrip && 'sticky left-1 w-[calc(100cqw-0.5rem)]'
            )}
          />
        )}
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

export function useCompactStage() {
  return useSyncExternalStore(watchCompactStage, isCompactStage, () => false);
}

function isCompactStage() {
  return window.matchMedia?.('(max-width: 1023px)').matches ?? false;
}
function watchCompactStage(recheck: () => void) {
  const query = window.matchMedia?.('(max-width: 1023px)');
  query?.addEventListener('change', recheck);
  return () => query?.removeEventListener('change', recheck);
}
