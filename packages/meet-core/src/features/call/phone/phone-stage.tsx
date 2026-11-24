import type { ReactNode } from 'react';

/** Phone tiles are portrait so four people fill a 2×2 grid. */
export const PHONE_TILE_ASPECT = 3 / 4;

/** More people than this switch the phone grid to speaker plus filmstrip. */
export const PHONE_GRID_MAX = 4;

/**
 * The tile that leads the phone filmstrip: the first active or recent speaker
 * that is on screen and is not the local person, else the first remote tile.
 */
export function pickPhoneSpeaker<T extends { key: string; userId: string }>(
  tiles: readonly T[],
  speakerIds: readonly string[],
  selfUserId: string | null
) {
  for (const id of speakerIds) {
    const tile = tiles.find(
      (candidate) => candidate.userId === id && id !== selfUserId
    );
    if (tile) return tile;
  }
  return tiles.find((tile) => tile.userId !== selfUserId) ?? tiles[0];
}

/** The leading tile above a swipeable strip of everyone else. */
export function PhoneFilmstrip({
  hero,
  strip,
}: {
  hero: ReactNode;
  strip: ReactNode;
}) {
  return (
    <>
      {hero}
      <div
        className="flex h-28 shrink-0 snap-x gap-2 overflow-x-auto overscroll-x-contain"
        data-phone-filmstrip
      >
        {strip}
      </div>
    </>
  );
}
