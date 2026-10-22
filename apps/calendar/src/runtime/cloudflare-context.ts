import { calendarRequest } from './request-context';

export function getCloudflareContext(_options?: { async?: boolean }) {
  const cloudflare = calendarRequest().cloudflare;
  if (!cloudflare)
    throw new Error('Calendar Cloudflare bindings are unavailable');
  return cloudflare;
}
