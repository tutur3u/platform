/**
 * Build-time hosting probes (network). Run by scripts/generate-roadmap-data.mjs
 * on every online build, outside Cloudflare, independent of GitHub. Bounded:
 * one request per host and per apex path, 8 at a time, 6 s each, 16 KiB
 * bodies, no redirects followed.
 */
import {
  apexUrl,
  classifyMigration,
  type HostingSnapshot,
  type ProbeOutcome,
  subdomainOrigin,
} from './hosting.ts';
import { PROBED_APPS, type ProbeFetch, probeHosts } from './host-probe.ts';

const TIMEOUT_MS = 6_000;
const MAX_BODY = 16_384;
const CONCURRENCY = 8;

async function limited<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index] as T);
      }
    })
  );
  return results;
}

/** One manual-redirect GET; never throws. */
export async function probe(
  fetcher: ProbeFetch,
  url: string,
  headers: Record<string, string>
): Promise<ProbeOutcome> {
  try {
    const response = await fetcher(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text().catch(() => '');
    const body = text.length <= MAX_BODY ? text : '';
    let buildInfo: { commit: string; appName: string | null } | null = null;
    if (/json/i.test(response.headers.get('content-type') ?? '')) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown> | null;
        const commit = parsed?.commitHash ?? parsed?.commit;
        if (typeof commit === 'string' && /^[a-f0-9]{40}$/.test(commit))
          buildInfo = {
            commit,
            appName:
              typeof parsed?.appName === 'string' ? parsed.appName : null,
          };
      } catch {
        buildInfo = null;
      }
    }
    return {
      ok: true,
      status: response.status,
      location: response.headers.get('location'),
      vercel: Boolean(response.headers.get('x-vercel-id')?.trim()),
      buildInfo,
    };
  } catch {
    return { ok: false };
  }
}

/** Observe providers and migration now; `checkedAt` is this build's time. */
export async function observeHosting(
  fetcher: ProbeFetch,
  registry: Readonly<Record<string, string>>,
  now: number,
  selfCommit: string | null = null
): Promise<HostingSnapshot> {
  // The tested provider classifier (x-vercel-id, then a Worker's own
  // answer); the roadmap itself is this Worker.
  const providers = (await probeHosts(fetcher, selfCommit)).map(
    ({ app, platform }) => ({ app, provider: platform })
  );
  const migration = await limited(
    Object.entries(registry),
    async ([app, basePath]) => {
      const from = subdomainOrigin(app, PROBED_APPS);
      const to = apexUrl(basePath);
      const [subdomain, apex] = await Promise.all([
        probe(fetcher, `${from}/`, {
          accept: 'text/html',
          'sec-fetch-mode': 'navigate',
        }),
        probe(fetcher, `${to}/api/build-info`, { accept: 'application/json' }),
      ]);
      return {
        app,
        from,
        to,
        state: classifyMigration(subdomain, apex, to, app),
      };
    }
  );
  return {
    checkedAt: new Date(now).toISOString(),
    mode: 'probed',
    registry: { ...registry },
    providers,
    migration,
  };
}
