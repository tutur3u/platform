import { mailRequest } from './request-context';

export function getCloudflareContext(_options?: { async?: boolean }) {
  const cloudflare = mailRequest().cloudflare;
  if (!cloudflare) throw new Error('Mail Cloudflare bindings are unavailable');
  return cloudflare;
}
