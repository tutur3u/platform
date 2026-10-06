'use client';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import { MiraParticipant } from './mira-participant';
import { ParticipantTile } from './participant-tile';
export type CallLayout = 'auto' | 'grid' | 'spotlight' | 'sidebar';
type Tile = {
  key: string;
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
  focus,
  onFocus,
  onChat,
}: {
  room: MeetRoomController;
  outputDeviceId?: string;
  audioSuppressed?: boolean;
  layout: CallLayout;
  compact?: boolean;
  focus: string | null;
  onFocus: (key: string | null) => void;
  onChat: () => void;
}) {
  const t = useTranslations('meet.call');
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
      result.push({
        key,
        participant,
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
  const explicitFocus = tiles.find((tile) => tile.key === focus);
  const focused =
    explicitFocus ??
    tiles.find((tile) => tile.kind === 'screen') ??
    tiles.find((tile) => tile.participant.userId !== room.state.selfUserId) ??
    tiles[0];
  const spotlight =
    (layout === 'spotlight' &&
      (!focus || !!explicitFocus || (focus === 'mira' && !!mira))) ||
    layout === 'sidebar' ||
    (layout === 'auto' &&
      (explicitFocus || tiles.some((tile) => tile.kind === 'screen')));
  const render = (tile: Tile, className: string) => (
    <ParticipantTile
      miraActive={!!mira}
      outputDeviceId={outputDeviceId}
      audioSuppressed={audioSuppressed}
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
      onFocus={onFocus}
      onRetry={room.reconnectReceivingMedia}
      onMute={room.state.role === 'host' ? mute : undefined}
    />
  );
  const focusedKey = focus === 'mira' && mira ? 'mira' : focused?.key;
  const count = tiles.length + (mira ? 1 : 0);
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
    <div
      style={{ '--stage-rows': Math.max(1, count - 1) } as CSSProperties}
      className={cn(
        'grid h-full min-h-0 gap-3 overflow-auto p-1',
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
      {tiles.map((tile) => render(tile, tileClass(tile.key)))}
      {renderMira(tileClass('mira'), compact)}
    </div>
  );
}
