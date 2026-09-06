export const MEET_REALTIME_URL = 'wss://meet-realtime.tuturuuu.com/realtime';

/** Retire the internal nginx route, including previously configured defaults. */
export function resolveMeetRealtimeUrl(
  configured?: string,
  development = false
) {
  const value = configured?.trim();
  if (!value)
    return development ? 'ws://127.0.0.1:8786/realtime' : MEET_REALTIME_URL;
  if (/^wss:\/\/meet\.tuturuuu\.com\/realtime\/?$/i.test(value))
    return MEET_REALTIME_URL;
  return value;
}
