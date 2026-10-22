import { meetRequest } from './request-context';

export function getCloudflareContext(_options?: { async?: boolean }) {
  const cloudflare = meetRequest().cloudflare;
  if (!cloudflare) throw new Error('Meet Cloudflare bindings are unavailable');
  return cloudflare;
}
