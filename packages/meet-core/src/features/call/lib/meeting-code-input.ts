import { supportedLocales } from '@tuturuuu/meet-core/i18n/routing';
import {
  MEET_BASE_PATH,
  MEET_CANONICAL_ORIGIN,
  MEET_LEGACY_ORIGIN,
} from '@tuturuuu/utils/meet-url';
import { decodeRoomCode } from './room-code';

export function parseMeetingCode(value: string, origin: string) {
  const input = value.trim();
  const direct = decodeRoomCode(input);
  if (direct) return direct;
  try {
    const url = new URL(input, origin);
    const meetOrigin =
      url.origin === MEET_CANONICAL_ORIGIN || url.origin === MEET_LEGACY_ORIGIN;
    if (!meetOrigin && url.origin !== origin) return null;
    if (
      url.origin === MEET_CANONICAL_ORIGIN &&
      !url.pathname.startsWith(`${MEET_BASE_PATH}/`)
    )
      return null;
    const path =
      url.origin === MEET_CANONICAL_ORIGIN
        ? url.pathname.slice(MEET_BASE_PATH.length)
        : url.pathname;
    const segments = path.split('/').filter(Boolean);
    const roomPath = segments.length === 2 && segments[0] === 'r';
    const localizedRoomPath =
      segments.length === 3 &&
      supportedLocales.some((locale) => locale === segments[0]) &&
      segments[1] === 'r';
    if (url.username || url.password || (!roomPath && !localizedRoomPath))
      return null;
    return decodeRoomCode(segments.at(-1) ?? '');
  } catch {
    return null;
  }
}
