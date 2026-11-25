import { bridgeRequest } from '../server/request-context';

type CloudflareContext<Env, Ctx> = { env: Env; ctx: Ctx };

function readCloudflareContext<Env, Ctx>(): CloudflareContext<Env, Ctx> {
  const cloudflare = bridgeRequest().cloudflare;
  if (!cloudflare) throw new Error('Cloudflare bindings are unavailable');
  return cloudflare as CloudflareContext<Env, Ctx>;
}

/**
 * `@opennextjs/cloudflare` `getCloudflareContext` over the bridge request,
 * with the same contract: `{ async: true }` returns a Promise (rejected when
 * the bindings are missing), so callers may chain `.then`/`.catch` on it.
 * Returning the context itself there makes a chained `.catch` a TypeError.
 */
export function getCloudflareContext<Env = unknown, Ctx = unknown>(options: {
  async: true;
}): Promise<CloudflareContext<Env, Ctx>>;
export function getCloudflareContext<Env = unknown, Ctx = unknown>(options?: {
  async?: false;
}): CloudflareContext<Env, Ctx>;
export function getCloudflareContext<Env = unknown, Ctx = unknown>(options?: {
  async?: boolean;
}): CloudflareContext<Env, Ctx> | Promise<CloudflareContext<Env, Ctx>>;
export function getCloudflareContext<Env = unknown, Ctx = unknown>(options?: {
  async?: boolean;
}) {
  if (!options?.async) return readCloudflareContext<Env, Ctx>();
  // Read inside the caller's request scope, before any await.
  try {
    return Promise.resolve(readCloudflareContext<Env, Ctx>());
  } catch (error) {
    return Promise.reject(error);
  }
}
