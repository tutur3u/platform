import { tracks } from './tracks.ts';

/** Display names for every track the history can classify into. */
export const TRACK_NAMES: Record<string, string> = {
  ...Object.fromEntries(tracks.map((track) => [track.id, track.name])),
  shortener: 'Short links',
  other: 'Other improvements',
};

export const HISTORY_TRACKS = Object.keys(TRACK_NAMES).filter(
  (id) => id !== 'other'
);
