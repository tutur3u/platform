import { supportedLocales } from '@/i18n/routing';
import { decodeRoomCode } from './room-code';

export function parseMeetingCode(value: string, origin: string) {
  const input = value.trim();
  const direct = decodeRoomCode(input);
  if (direct) return direct;
  try {
    const url = new URL(input, origin);
    const segments = url.pathname.split('/').filter(Boolean);
    const roomPath = segments.length === 2 && segments[0] === 'r';
    const localizedRoomPath =
      segments.length === 3 &&
      supportedLocales.some((locale) => locale === segments[0]) &&
      segments[1] === 'r';
    if (url.origin !== origin || (!roomPath && !localizedRoomPath)) return null;
    return decodeRoomCode(segments.at(-1) ?? '');
  } catch {
    return null;
  }
}
