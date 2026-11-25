// `@opennextjs/cloudflare` for vinext Worker builds: the bindings come from
// the Workers runtime module instead of the OpenNext request context.
// @ts-expect-error Provided by workerd; the Next.js type-check has no Workers types.
import { env, waitUntil } from 'cloudflare:workers';

type CloudflareContext<Env, Ctx> = { env: Env; ctx: Ctx };

function readCloudflareContext<Env, Ctx>(): CloudflareContext<Env, Ctx> {
  return { env: env as Env, ctx: { waitUntil } as Ctx };
}

/**
 * Same contract as `@opennextjs/cloudflare`: `{ async: true }` returns a
 * Promise, so callers may chain `.then`/`.catch` on it. Returning the context
 * itself there makes a chained `.catch` a TypeError.
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
  const context = readCloudflareContext<Env, Ctx>();
  return options?.async ? Promise.resolve(context) : context;
}
