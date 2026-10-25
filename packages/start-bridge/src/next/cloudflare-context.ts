import { bridgeRequest } from '../core/request-context';

/** `@opennextjs/cloudflare` `getCloudflareContext` over the bridge request. */
export function getCloudflareContext<Env = unknown, Ctx = unknown>(_options?: {
  async?: boolean;
}): { env: Env; ctx: Ctx } {
  const cloudflare = bridgeRequest().cloudflare;
  if (!cloudflare) throw new Error('Cloudflare bindings are unavailable');
  return cloudflare as { env: Env; ctx: Ctx };
}
