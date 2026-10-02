import { NextResponse } from 'next/server';
import { ALL_SATELLITE_APP_SESSION_TARGETS } from '@/lib/api-auth-audiences';
export const realtimeAuth = {
  allowAppSessionAuth: {
    targetApp: ALL_SATELLITE_APP_SESSION_TARGETS,
  },
  maxPayloadSize: 1024,
};
export const noStore = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
export function channelEndpoint() {
  const url = new URL(
    process.env.CLOUDFLARE_CHANNELS_URL ??
      'wss://meet-realtime.tuturuuu.com/channels'
  );
  if (
    url.protocol !== 'wss:' &&
    !(
      process.env.NODE_ENV !== 'production' &&
      url.protocol === 'ws:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  )
    throw new Error('Invalid channel endpoint');
  url.pathname = '/channels';
  url.search = '';
  url.hash = '';
  return url.toString();
}
export function realtimeUnavailable() {
  return NextResponse.json(
    { error: 'Realtime unavailable' },
    { status: 503, headers: noStore }
  );
}
