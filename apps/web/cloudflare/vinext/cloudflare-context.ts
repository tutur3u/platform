// `@opennextjs/cloudflare` for vinext Worker builds: the bindings come from
// the Workers runtime module instead of the OpenNext request context.
// @ts-expect-error Provided by workerd; the Next.js type-check has no Workers types.
import { env, waitUntil } from 'cloudflare:workers';

export function getCloudflareContext<Env = unknown, Ctx = unknown>(_options?: {
  async?: boolean;
}): { env: Env; ctx: Ctx } {
  return { env: env as Env, ctx: { waitUntil } as Ctx };
}
