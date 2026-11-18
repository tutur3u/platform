import type { GitHubCacheStore, GitHubResponseCache } from './response-cache';

type WorkerCacheStorage = { default?: GitHubCacheStore };

/**
 * The Worker's per-colo response cache, or `null` on Vercel/Node where no
 * Cache API exists and GitHub is called directly. `waitUntil` comes from the
 * request's execution context when the bridge exposes one.
 */
export async function resolveGitHubResponseCache(): Promise<GitHubResponseCache | null> {
  const store = (globalThis as { caches?: WorkerCacheStorage }).caches?.default;
  if (!store) return null;

  try {
    const { getCloudflareContext } =
      await import('@tuturuuu/start-bridge/next/cloudflare-context');
    const { ctx } = getCloudflareContext<
      unknown,
      { waitUntil?: (work: Promise<unknown>) => void }
    >();
    const waitUntil = ctx.waitUntil?.bind(ctx);
    return { store, waitUntil };
  } catch {
    return { store };
  }
}
