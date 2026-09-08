'use client';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
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
  layout,
  focus,
  onFocus,
}: {
  room: MeetRoomController;
  layout: CallLayout;
  focus: string | null;
  onFocus: (key: string | null) => void;
}) {
  const t = useTranslations('meet.call');
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
  const explicitFocus = tiles.find((tile) => tile.key === focus);
  const focused =
    explicitFocus ??
    tiles.find((tile) => tile.kind === 'screen') ??
    tiles.find((tile) => tile.participant.userId !== room.state.selfUserId) ??
    tiles[0];
  const spotlight =
    (layout === 'spotlight' && (!focus || !!explicitFocus)) ||
    layout === 'sidebar' ||
    (layout === 'auto' &&
      (explicitFocus || tiles.some((tile) => tile.kind === 'screen')));
  const render = (tile: Tile, className: string) => (
    <ParticipantTile
      key={tile.key}
      className={className}
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
      onMute={room.state.role === 'host' ? mute : undefined}
    />
  );
  if (spotlight && focused)
    return (
      <div
        className={cn(
          'flex h-full min-h-0 gap-3',
          layout === 'sidebar' ? 'flex-col lg:flex-row' : 'flex-col'
        )}
      >
        {render(focused, 'min-h-0 min-w-0 flex-1')}
        {tiles.length > 1 && (
          <div
            className={cn(
              'flex shrink-0 gap-2 overflow-auto p-1',
              layout === 'sidebar' ? 'lg:w-52 lg:flex-col' : ''
            )}
          >
            {tiles
              .filter((tile) => tile.key !== focused.key)
              .map((tile) =>
                render(tile, 'aspect-video w-40 shrink-0 lg:w-48')
              )}
          </div>
        )}
      </div>
    );
  return (
    <div
      className={cn(
        'grid h-full min-h-0 auto-rows-[minmax(8rem,1fr)] gap-3 overflow-auto p-1',
        columns(tiles.length)
      )}
    >
      {tiles.map((tile) => render(tile, 'min-h-32'))}
    </div>
  );
}
