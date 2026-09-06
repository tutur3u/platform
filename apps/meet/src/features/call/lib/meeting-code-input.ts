import { decodeRoomCode } from './room-code';

export function parseMeetingCode(value: string, origin: string) {
  const input = value.trim();
  const direct = decodeRoomCode(input);
  if (direct) return direct;
  try {
    const url = new URL(input, origin);
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.origin !== origin || segments.at(-2) !== 'r') return null;
    return decodeRoomCode(segments.at(-1) ?? '');
  } catch {
    return null;
  }
}
