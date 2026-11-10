import type { Platform } from './model.ts';

/**
 * Fixed allowlist of public app hosts whose public build-info is probed.
 * Request input never selects a host. Only {app, platform, commit} leaves
 * the classifier; headers and bodies are discarded.
 */
export const PROBED_APPS = (
  [
    {
      app: 'web',
      name: 'Tuturuuu',
      url: 'https://tuturuuu.com/api/build-info',
    },
    { app: 'marketing', name: 'Marketing' },
    { app: 'workspace', name: 'Workspace' },
    { app: 'tasks', name: 'Tasks' },
    { app: 'calendar', name: 'Calendar' },
    { app: 'finance', name: 'Finance' },
    { app: 'drive', name: 'Drive' },
    { app: 'chat', name: 'Chat' },
    { app: 'mail', name: 'Mail' },
    { app: 'meet', name: 'Meet' },
    { app: 'ai', name: 'AI' },
    { app: 'contacts', name: 'CRM' },
    { app: 'forms', name: 'Forms' },
    { app: 'track', name: 'Track' },
    { app: 'learn', name: 'Learn' },
    { app: 'teach', name: 'Teach' },
    { app: 'rewise', name: 'Rewise' },
    { app: 'mind', name: 'Mind' },
    { app: 'nova', name: 'Nova' },
    { app: 'hive', name: 'Hive' },
    { app: 'colab', name: 'Colab' },
    { app: 'inventory', name: 'Inventory' },
    { app: 'pay', name: 'Pay' },
    { app: 'tools', name: 'Tools' },
    { app: 'apps', name: 'Apps' },
    { app: 'playground', name: 'Playground' },
    {
      app: 'shortener',
      name: 'Short links',
      url: 'https://ttr.gg/api/build-info',
    },
    {
      app: 'storefront',
      name: 'Store',
      url: 'https://store.tuturuuu.com/api/build-info',
    },
    { app: 'cms', name: 'CMS' },
  ] as { app: string; name: string; url?: string }[]
).map((entry) => ({
  ...entry,
  url: entry.url ?? `https://${entry.app}.tuturuuu.com/api/build-info`,
}));

export const APP_NAMES: Record<string, string> = {
  ...Object.fromEntries(PROBED_APPS.map((entry) => [entry.app, entry.name])),
  roadmap: 'Roadmap',
  mobile: 'Mobile app',
};

export type ProbeFetch = (url: string, init?: RequestInit) => Promise<Response>;

const COMMIT = /^[a-f0-9]{40}$/;
const MAX_BODY = 16_384;

export type ProbeResult = {
  app: string;
  platform: Exclude<Platform, 'store'>;
  commit: string | null;
};

/** Classify one probe response; never returns header or body content. */
export function classifyProbeResponse(
  status: number,
  headers: Headers,
  body: string
): Omit<ProbeResult, 'app'> {
  const vercel = Boolean(headers.get('x-vercel-id')?.trim());
  let commit: string | null = null;
  if (
    status === 200 &&
    (headers.get('content-type') ?? '').toLowerCase().includes('json') &&
    body.length <= MAX_BODY
  ) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown> | null;
      const value = parsed?.commitHash ?? parsed?.commit;
      if (typeof value === 'string' && COMMIT.test(value)) commit = value;
    } catch {
      commit = null;
    }
  }
  if (vercel) return { platform: 'vercel', commit };
  // A Worker answers build-info itself; "local" builds still prove the host.
  if (
    status === 200 &&
    (headers.get('server') ?? '').toLowerCase() === 'cloudflare'
  )
    return { platform: 'workers', commit };
  return { platform: 'unknown', commit: null };
}

async function readBounded(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return '';
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(
    chunks.reduce((all, chunk) => {
      const next = new Uint8Array(all.byteLength + chunk.byteLength);
      next.set(all);
      next.set(chunk, all.byteLength);
      return next;
    }, new Uint8Array())
  );
}

export async function probeHosts(
  fetcher: ProbeFetch,
  selfCommit: string | null,
  timeoutMs = 4000
): Promise<ProbeResult[]> {
  const probes = PROBED_APPS.map(async ({ app, url }) => {
    try {
      const response = await fetcher(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await readBounded(response);
      return {
        app,
        ...classifyProbeResponse(response.status, response.headers, body),
      };
    } catch {
      return { app, platform: 'unknown' as const, commit: null };
    }
  });
  const results = await Promise.all(probes);
  results.push({
    app: 'roadmap',
    platform: 'workers',
    commit: selfCommit && COMMIT.test(selfCommit) ? selfCommit : null,
  });
  return results;
}

/** Public /roadmap/api/hosts payload. */
export type HostsPayload = { checkedAt: string; hosts: ProbeResult[] };

export function parseHostsPayload(value: unknown): HostsPayload {
  if (!value || typeof value !== 'object') throw new Error('Invalid hosts');
  const { checkedAt, hosts, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length) throw new Error('Unexpected hosts fields');
  if (typeof checkedAt !== 'string' || !Number.isFinite(Date.parse(checkedAt)))
    throw new Error('Invalid hosts time');
  if (!Array.isArray(hosts) || hosts.length > 64)
    throw new Error('Invalid hosts');
  const known = new Set([...PROBED_APPS.map((entry) => entry.app), 'roadmap']);
  return {
    checkedAt,
    hosts: hosts.map((item) => {
      const { app, platform, commit, ...extra } = item as Record<
        string,
        unknown
      >;
      if (Object.keys(extra).length) throw new Error('Unexpected host fields');
      if (typeof app !== 'string' || !known.has(app))
        throw new Error('Unknown host');
      if (
        platform !== 'workers' &&
        platform !== 'vercel' &&
        platform !== 'unknown'
      )
        throw new Error('Invalid platform');
      if (
        commit !== null &&
        (typeof commit !== 'string' || !COMMIT.test(commit))
      )
        throw new Error('Invalid commit');
      return { app, platform, commit };
    }),
  };
}

export const HOSTS_PATH = '/roadmap/api/hosts';
export function isHostsPath(pathname: string) {
  return pathname === HOSTS_PATH;
}

let memo: { at: number; payload: Promise<HostsPayload> } | null = null;

/**
 * GET/HEAD /roadmap/api/hosts. One isolate shares a 60-second result, so a
 * burst of page views fans out to the allowlist at most once a minute.
 */
export async function hostsResponse(
  method: string,
  fetcher: ProbeFetch,
  selfCommit: string | null,
  now = Date.now()
): Promise<Response> {
  const headers = {
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  };
  if (method !== 'GET' && method !== 'HEAD')
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...headers, allow: 'GET, HEAD' },
    });
  if (!memo || now - memo.at > 60_000) {
    const payload = probeHosts(fetcher, selfCommit).then((hosts) => ({
      checkedAt: new Date(now).toISOString(),
      hosts,
    }));
    memo = { at: now, payload };
    payload.catch(() => {
      memo = null;
    });
  }
  const payload = await memo.payload;
  return new Response(method === 'HEAD' ? null : JSON.stringify(payload), {
    status: 200,
    headers,
  });
}

export function resetHostsMemo() {
  memo = null;
}
