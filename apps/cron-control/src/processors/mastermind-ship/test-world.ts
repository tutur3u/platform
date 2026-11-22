// Test support: an in-memory GitHub, Cloudflare and Mastermind store behind
// one fetch, with a request log, so collector tests assert exact provider
// traffic. Not imported by runtime code.

export const STORE_URL = 'https://store.example.test';
export const STORE_TOKEN = 's'.repeat(40);
export const GITHUB_TOKEN = 'ghp_' + 'g'.repeat(36);
export const CF_TOKEN = 'cf_' + 'x'.repeat(40);
export const ACCOUNT = 'e8912e2867beecc673d171907bf09649';

export const sha = (seed: string) => seed.repeat(40).slice(0, 40);

export interface WorldCommit {
  oid: string;
  date: string;
  paths: string[];
}
export interface WorldDeployment {
  environment: string;
  sha: string;
  at: string;
  state?: string;
  ci?: string | null;
}
export interface WorldRepo {
  head: string;
  commits: WorldCommit[];
  deployments: WorldDeployment[];
}
export interface WorldWorker {
  versionId: string;
  createdOn: string;
  message: string;
}

export function makeWorld() {
  const store = new Map<string, string>();
  const log: string[] = [];
  const world = {
    store,
    log,
    storeStopped: false,
    storeDown: false,
    /** Response status forced for GitHub requests (e.g. 403). */
    githubStatus: 0 as number,
    /** Response status forced for Cloudflare requests (e.g. 401). */
    cloudflareStatus: 0 as number,
    githubHeaders: {} as Record<string, string>,
    etag: '"runs-1"',
    remaining: 4000,
    repos: new Map<string, WorldRepo>(),
    workers: new Map<string, WorldWorker>(),
    installations: new Map<string, number>(),
    providerRequests: () =>
      log.filter((entry) => !entry.startsWith('store')).length,
  };

  function graphql(query: string) {
    const data: Record<string, unknown> = {
      rateLimit: {
        remaining: world.remaining,
        resetAt: '2026-11-22T12:00:00Z',
      },
    };
    for (const block of query.split(/(?= [rf]\d+: repository\()/u).slice(1)) {
      const [, alias, owner, name] =
        /([rf]\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/u.exec(
          block
        )!;
      const repo = world.repos.get(`${owner}/${name}`);
      if (!repo) {
        data[alias!] = null;
        continue;
      }
      const dated = (oid: string) =>
        repo.commits.find((commit) => commit.oid === oid)?.date ??
        '2026-11-01T00:00:00Z';
      const ordered = [...repo.commits].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const head: Record<string, unknown> = {
        oid: repo.head,
        committedDate: dated(repo.head),
      };
      for (const [, key, path] of block.matchAll(
        /(h\d+): history\(first: 100, path: "([^"]+)"\)/gu
      ))
        head[key!] = {
          nodes: ordered
            .filter((commit) => commit.paths.some((p) => p.startsWith(path!)))
            .slice(0, 100)
            .map((commit) => ({ oid: commit.oid, committedDate: commit.date })),
        };
      if (block.includes('hall: history'))
        head.hall = {
          nodes: ordered.slice(0, 100).map((commit) => ({
            oid: commit.oid,
            committedDate: commit.date,
          })),
        };
      const repoData: Record<string, unknown> = { head };
      for (const [, key, first, after, list] of block.matchAll(
        /(\w+): deployments\(first: (\d+)(?:, after: "(\d+)")?(?:, environments: (\[[^\]]*\]))?/gu
      )) {
        const names: string[] | null = list ? JSON.parse(list) : null;
        const offset = Number(after ?? 0);
        const matching = [...repo.deployments]
          .filter((d) => !names || names.includes(d.environment))
          .sort((a, b) => b.at.localeCompare(a.at));
        repoData[key!] = {
          pageInfo: {
            hasNextPage: matching.length > offset + Number(first),
            endCursor: String(offset + Number(first)),
          },
          nodes: matching.slice(offset, offset + Number(first)).map((d) => ({
            environment: d.environment,
            createdAt: d.at,
            commitOid: d.sha,
            latestStatus: { state: d.state ?? 'SUCCESS', createdAt: d.at },
            commit: {
              committedDate: dated(d.sha),
              statusCheckRollup:
                d.ci === null ? null : { state: d.ci ?? 'SUCCESS' },
            },
          })),
        };
      }
      data[alias!] = repoData;
    }
    return { data };
  }

  async function fetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    if (url.origin === STORE_URL) {
      log.push(`store ${url.pathname}`);
      if (headers.get('authorization') !== `Bearer ${STORE_TOKEN}`)
        return Response.json(
          { ok: false, error: 'unauthorized' },
          { status: 401 }
        );
      if (world.storeDown) return new Response('down', { status: 503 });
      if (world.storeStopped)
        return Response.json({ ok: false, error: 'stopped' }, { status: 503 });
      const body = JSON.parse(String(init?.body)) as {
        ops: { op: string; k?: string; ks?: string[]; v?: string }[];
      };
      return Response.json({
        ok: true,
        results: body.ops.map((op) => {
          if (op.op === 'mget') return op.ks!.map((k) => store.get(k) ?? null);
          store.set(op.k!, op.v!);
          return true;
        }),
      });
    }
    if (url.hostname === 'api.github.com') {
      log.push(`github ${init?.method ?? 'GET'} ${url.pathname}`);
      if (world.githubStatus)
        return new Response('refused', {
          status: world.githubStatus,
          headers: world.githubHeaders,
        });
      const installation = /^\/repos\/([^/]+)\/[^/]+\/installation$/u.exec(
        url.pathname
      );
      if (installation) {
        const id = world.installations.get(installation[1]!);
        return id
          ? Response.json({ id })
          : new Response('none', { status: 404 });
      }
      if (/^\/app\/installations\/\d+\/access_tokens$/u.test(url.pathname))
        return Response.json(
          { token: 'ghs_' + 'i'.repeat(36) },
          { status: 201 }
        );
      if (url.pathname.endsWith('/actions/runs'))
        return headers.get('if-none-match') === world.etag
          ? new Response(null, { status: 304, headers: { etag: world.etag } })
          : Response.json(
              { workflow_runs: [] },
              { headers: { etag: world.etag } }
            );
      if (url.pathname === '/graphql')
        return Response.json(graphql(JSON.parse(String(init?.body)).query));
      return new Response('missing', { status: 404 });
    }
    if (url.hostname === 'api.cloudflare.com') {
      log.push(`cloudflare ${url.pathname.split('/scripts/')[1]}`);
      if (world.cloudflareStatus)
        return new Response('refused', { status: world.cloudflareStatus });
      const [, script, rest] =
        /\/workers\/scripts\/([^/]+)\/(.+)$/u.exec(url.pathname) ?? [];
      const worker = world.workers.get(script ?? '');
      if (!worker) return new Response('missing', { status: 404 });
      if (rest === 'deployments')
        return Response.json({
          success: true,
          result: {
            deployments: [
              {
                id: 'dep-1',
                created_on: worker.createdOn,
                versions: [{ version_id: worker.versionId, percentage: 100 }],
              },
            ],
          },
        });
      return Response.json({
        success: true,
        result: {
          id: worker.versionId,
          metadata: { created_on: worker.createdOn },
          annotations: { 'workers/message': worker.message },
        },
      });
    }
    throw new Error(`Unexpected request ${url.href}`);
  }

  return { world, fetch };
}

/** A small platform history: production two commits behind main for Web. */
export function seedWorld(world: ReturnType<typeof makeWorld>['world']) {
  world.repos.set('tutur3u/platform', {
    head: sha('c'),
    commits: [
      {
        oid: sha('a'),
        date: '2026-11-20T01:00:00Z',
        paths: ['apps/web/a.ts', 'apps/calendar/a.ts'],
      },
      { oid: sha('b'), date: '2026-11-21T01:00:00Z', paths: ['apps/web/b.ts'] },
      {
        oid: sha('c'),
        date: '2026-11-21T05:00:00Z',
        paths: ['packages/ui/c.ts'],
      },
    ],
    deployments: [
      {
        environment: 'cloudflare-production-web',
        sha: sha('a'),
        at: '2026-11-20T02:00:00Z',
      },
      {
        environment: 'cloudflare-production-web',
        sha: sha('b'),
        at: '2026-11-21T02:00:00Z',
        state: 'FAILURE',
      },
      {
        environment: 'wave1-web-staging',
        sha: sha('c'),
        at: '2026-11-21T06:00:00Z',
        ci: 'PENDING',
      },
      {
        environment: 'wave1-calendar-production',
        sha: sha('a'),
        at: '2026-11-20T03:00:00Z',
        ci: 'FAILURE',
      },
      {
        environment: 'mobile-store-beta',
        sha: sha('a'),
        at: '2026-11-20T04:00:00Z',
      },
    ],
  });
  world.repos.set('upskii/platform', {
    head: sha('e'),
    commits: [
      { oid: sha('d'), date: '2026-11-19T01:00:00Z', paths: ['x'] },
      { oid: sha('e'), date: '2026-11-21T01:00:00Z', paths: ['y'] },
    ],
    deployments: [
      { environment: 'Production', sha: sha('d'), at: '2026-11-19T02:00:00Z' },
      { environment: 'Preview', sha: sha('e'), at: '2026-11-21T02:00:00Z' },
    ],
  });
  world.repos.set('tutur3u/pktm', {
    head: sha('f'),
    commits: [{ oid: sha('f'), date: '2026-11-20T01:00:00Z', paths: ['z'] }],
    deployments: [
      { environment: 'production', sha: sha('f'), at: '2026-11-20T02:00:00Z' },
    ],
  });
  world.workers.set('tuturuuu-calendar', {
    versionId: '11111111-1111-4111-8111-111111111111',
    createdOn: '2026-11-20T03:01:00Z',
    message: sha('a'),
  });
}
