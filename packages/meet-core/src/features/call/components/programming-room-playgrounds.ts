import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import type { ProgrammingLanguage } from './programming-setup';

/** Language -> playground id the room already opened, so switching back restores that code. */
export type RoomPlaygrounds = Partial<Record<ProgrammingLanguage, string>>;

const key = (meetingId: string) => `meet.programming.playgrounds:${meetingId}`;

/** The host's tab remembers the room's playgrounds across a reload; blocked storage reads as none. */
export function readRoomPlaygrounds(meetingId: string): RoomPlaygrounds {
  try {
    const stored: unknown = JSON.parse(
      window.sessionStorage.getItem(key(meetingId)) ?? '{}'
    );
    if (!stored || typeof stored !== 'object') return {};
    const known: RoomPlaygrounds = {};
    for (const language of PLAYGROUND_LANGUAGES) {
      const id = (stored as Record<string, unknown>)[language];
      if (typeof id === 'string' && id) known[language] = id;
    }
    return known;
  } catch {
    return {};
  }
}

export function rememberRoomPlayground(
  meetingId: string,
  language: ProgrammingLanguage,
  id: string
) {
  try {
    window.sessionStorage.setItem(
      key(meetingId),
      JSON.stringify({ ...readRoomPlaygrounds(meetingId), [language]: id })
    );
  } catch {
    // The next switch creates a playground instead of reusing one.
  }
}

export function forgetRoomPlayground(
  meetingId: string,
  language: ProgrammingLanguage
) {
  try {
    const known = readRoomPlaygrounds(meetingId);
    delete known[language];
    window.sessionStorage.setItem(key(meetingId), JSON.stringify(known));
  } catch {
    // Nothing was stored.
  }
}
