import {
  environmentMatches,
  type ShipAppId,
  type ShipAppSpec,
  type ShipEnvName,
} from './catalog';
import {
  type Commit,
  commits,
  deployState,
  HISTORY_PAGE,
  latestRelease,
  pendingRelease,
} from './github-facts';
import {
  GITHUB_API,
  GITHUB_HEADERS,
  type GithubAuthEnv,
  githubBearer,
} from './github-auth';
import {
  type RequestBudget,
  SHA,
  type ShipFetchDeps,
  ShipSourceError,
  shipFetch,
} from './http';
import type { ShipDeployState, ShipPending, ShipRelease } from './snapshot';

// One repository's GitHub reads per run: a conditional probe of each repository's
// newest Actions run (a 304 costs no rate limit), then one batched GraphQL
// query for every tracked environment, CI rollup and path history, and at
// most MAX_FOLLOW_UP_PAGES more deployment pages when an environment's
// first page holds no success. A probe that finds nothing new skips the
// query while the last full read is recent.

export { HISTORY_PAGE, latestRelease, pendingRelease } from './github-facts';

// Shorter than the clients' six-minute stale window, so a reused read is
// never shown past it.
export const UNCHANGED_REUSE_MS = 4 * 60_000;
const LOW_RATE_LIMIT = 200;

/**
 * `undefined` means the reads could not tell (no success within the pages
 * read); the previous fact is kept, with `attempts` as its deploy state.
 */
export interface GithubFacts {
  production: ShipRelease | null | undefined;
  staging: ShipRelease | null | undefined;
  pending: ShipPending | null | undefined;
  attempts: Record<ShipEnvName, ShipDeployState | null>;
}

/** Deployment pages read after the batched query, per repository and run. */
export const MAX_FOLLOW_UP_PAGES = 2;
const CURSOR = /^[A-Za-z0-9+/=_-]{1,200}$/u;

interface FollowUp {
  spec: ShipAppSpec;
  env: ShipEnvName;
  repository: string;
  cursor: string;
  histories: Commit[][];
  headSha: string | null;
}

export type GithubOwnerResult =
  | { kind: 'unchanged' }
  | {
      kind: 'read';
      facts: Map<ShipAppId, GithubFacts>;
      /** Set when the remaining GraphQL budget is low. */
      retryAt: number | null;
    };

const q = (value: string) => JSON.stringify(value);

const DEPLOYMENT = `pageInfo { hasNextPage endCursor } nodes { environment createdAt commitOid latestStatus { state createdAt } commit { committedDate statusCheckRollup { state } } }`;

function repoAlias(index: number) {
  return `r${index}`;
}

/** The batched query; every interpolated value comes from the validated catalog. */
export function buildShipQuery(specs: readonly ShipAppSpec[]) {
  const repos = [...new Set(specs.map((spec) => spec.repository!))];
  const blocks = repos.map((repository, index) => {
    const [owner, name] = repository.split('/') as [string, string];
    const members = specs.filter((spec) => spec.repository === repository);
    const branch = members[0]!.branch;
    const paths = [...new Set(members.flatMap((spec) => spec.paths))];
    const whole = members.some((spec) => spec.paths.length === 0);
    const history = [
      ...paths.map(
        (path, i) =>
          `h${i}: history(first: ${HISTORY_PAGE}, path: ${q(path)}) { nodes { oid committedDate } }`
      ),
      ...(whole
        ? [
            `hall: history(first: ${HISTORY_PAGE}) { nodes { oid committedDate } }`,
          ]
        : []),
    ].join(' ');
    const listed = members.flatMap((spec) =>
      (['production', 'staging'] as const).flatMap((env) => {
        const names = spec.environments[env];
        return names && names.length > 0
          ? [
              `${spec.id.replace(/-/gu, '_')}_${env}: deployments(first: 10, environments: ${JSON.stringify(names)}, orderBy: { field: CREATED_AT, direction: DESC }) { ${DEPLOYMENT} }`,
            ]
          : [];
      })
    );
    const matched = members.some(
      (spec) => spec.environments.production === null
    )
      ? [
          `any: deployments(first: 50, orderBy: { field: CREATED_AT, direction: DESC }) { ${DEPLOYMENT} }`,
        ]
      : [];
    return `${repoAlias(index)}: repository(owner: ${q(owner)}, name: ${q(name)}) { head: object(expression: ${q(branch)}) { ... on Commit { oid committedDate ${history} } } ${[...listed, ...matched].join(' ')} }`;
  });
  return {
    repos,
    query: `query { rateLimit { remaining resetAt } ${blocks.join(' ')} }`,
  };
}

type Connection = {
  nodes?: unknown;
  pageInfo?: { hasNextPage?: unknown; endCursor?: unknown };
};

const strip = (
  release: ReturnType<typeof latestRelease>
): ShipRelease | null | undefined =>
  release
    ? {
        sha: release.sha,
        deployedAt: release.deployedAt,
        environment: release.environment,
        ci: release.ci,
        deploy: release.deploy,
      }
    : release;

function readConnection(
  connection: Connection | undefined,
  spec: ShipAppSpec,
  env: ShipEnvName,
  newest?: ShipDeployState
) {
  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const more = connection?.pageInfo?.hasNextPage === true;
  const cursor = connection?.pageInfo?.endCursor;
  return {
    release: latestRelease(nodes, spec, env, more, newest),
    cursor:
      more && typeof cursor === 'string' && CURSOR.test(cursor) ? cursor : null,
  };
}

/** Fails closed: errors beside data or a missing repository throw. */
function dataOf(json: unknown) {
  const data =
    json && typeof json === 'object' && 'data' in json
      ? (json.data as Record<string, unknown> | null)
      : null;
  const errors =
    json && typeof json === 'object' && 'errors' in json ? json.errors : null;
  if (!data || (Array.isArray(errors) && errors.length > 0))
    throw new ShipSourceError('invalid');
  return data;
}

export function parseShipResponse(
  json: unknown,
  specs: readonly ShipAppSpec[],
  repos: readonly string[],
  now: number
): {
  facts: Map<ShipAppId, GithubFacts>;
  retryAt: number | null;
  followUps: FollowUp[];
} {
  const data = dataOf(json);
  const facts = new Map<ShipAppId, GithubFacts>();
  const followUps: FollowUp[] = [];
  repos.forEach((repository, index) => {
    const repo = data[repoAlias(index)] as Record<string, unknown> | null;
    if (!repo) throw new ShipSourceError('invalid');
    const head = (repo.head ?? null) as Record<string, unknown> | null;
    const members = specs.filter((spec) => spec.repository === repository);
    const paths = [...new Set(members.flatMap((spec) => spec.paths))];
    for (const spec of members) {
      const histories =
        spec.paths.length === 0
          ? [commits(head?.hall)]
          : spec.paths.map((path) =>
              commits(head?.[`h${paths.indexOf(path)}`])
            );
      const headSha =
        typeof head?.oid === 'string' && SHA.test(head.oid) ? head.oid : null;
      const hasStaging =
        spec.environments.staging === null ||
        spec.environments.staging.length > 0;
      const attempts: GithubFacts['attempts'] = {
        production: null,
        staging: null,
      };
      const read = (env: ShipEnvName) => {
        const connection = (
          spec.environments.production === null
            ? repo.any
            : repo[connectionAlias(spec, env)]
        ) as Connection | undefined;
        const result = readConnection(connection, spec, env);
        if (result.release === undefined) {
          attempts[env] = firstAttempt(connection, spec, env);
          if (result.cursor)
            followUps.push({
              spec,
              env,
              repository,
              cursor: result.cursor,
              histories,
              headSha,
            });
        }
        return result.release;
      };
      const production = read('production');
      const staging = hasStaging ? read('staging') : null;
      facts.set(spec.id, {
        production: strip(production),
        staging: strip(staging),
        // The gap is measured from the live release, so it is unknown with it.
        pending:
          production === undefined
            ? undefined
            : headSha
              ? pendingRelease(histories, production, headSha)
              : null,
        attempts,
      });
    }
  });
  const limit = data.rateLimit as {
    remaining?: unknown;
    resetAt?: unknown;
  } | null;
  const reset = Date.parse(String(limit?.resetAt ?? ''));
  const retryAt =
    typeof limit?.remaining === 'number' &&
    limit.remaining < LOW_RATE_LIMIT &&
    Number.isFinite(reset) &&
    reset > now
      ? reset
      : null;
  return { facts, retryAt, followUps };
}

function connectionAlias(spec: ShipAppSpec, env: ShipEnvName) {
  return `${spec.id.replace(/-/gu, '_')}_${env}`;
}

/**
 * The deploy state of the newest attempt for the environment on this page,
 * or null when the page holds none (an unfiltered page of other
 * environments says nothing about this one).
 */
function firstAttempt(
  connection: Connection | undefined,
  spec: ShipAppSpec,
  env: ShipEnvName
): ShipDeployState | null {
  const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];
  const newest = nodes.find(
    (node: unknown) =>
      !!node &&
      typeof node === 'object' &&
      'environment' in node &&
      typeof node.environment === 'string' &&
      environmentMatches(spec, env, node.environment)
  ) as { latestStatus?: { state?: unknown } | null } | undefined;
  return newest ? deployState(newest.latestStatus?.state) : null;
}

/** One query for every unresolved environment, each from its cursor. */
export function buildFollowUpQuery(followUps: readonly FollowUp[]) {
  return `query { ${followUps
    .map(({ spec, env, repository, cursor }, index) => {
      const [owner, name] = repository.split('/') as [string, string];
      const names = spec.environments[env];
      const filter = names ? `, environments: ${JSON.stringify(names)}` : '';
      return `f${index}: repository(owner: ${q(owner)}, name: ${q(name)}) { c: deployments(first: ${HISTORY_PAGE}, after: ${q(cursor)}${filter}, orderBy: { field: CREATED_AT, direction: DESC }) { ${DEPLOYMENT} } }`;
    })
    .join(' ')} }`;
}

/** Resolves follow-ups in place; returns the ones that need another page. */
export function applyFollowUps(
  json: unknown,
  followUps: readonly FollowUp[],
  facts: Map<ShipAppId, GithubFacts>
): FollowUp[] {
  const data = dataOf(json);
  const next: FollowUp[] = [];
  followUps.forEach((followUp, index) => {
    const repo = data[`f${index}`] as { c?: Connection } | null;
    if (!repo) throw new ShipSourceError('invalid');
    const current = facts.get(followUp.spec.id)!;
    const newest = current.attempts[followUp.env] ?? undefined;
    // The first page with a matching deployment holds the newest attempt.
    current.attempts[followUp.env] ??= firstAttempt(
      repo.c,
      followUp.spec,
      followUp.env
    );
    const result = readConnection(repo.c, followUp.spec, followUp.env, newest);
    if (result.release === undefined) {
      if (result.cursor) next.push({ ...followUp, cursor: result.cursor });
      return;
    }
    current[followUp.env] = strip(result.release);
    if (followUp.env === 'production')
      current.pending = followUp.headSha
        ? pendingRelease(followUp.histories, result.release, followUp.headSha)
        : null;
  });
  return next;
}

export async function collectGithubOwner(
  env: GithubAuthEnv,
  deps: ShipFetchDeps,
  budget: RequestBudget,
  owner: string,
  specs: readonly ShipAppSpec[],
  state: {
    etags: Record<string, string>;
    installations: Record<string, number>;
  },
  options: { force: boolean; lastReadAt: number | null }
): Promise<GithubOwnerResult> {
  const bearer = await githubBearer(
    env,
    deps,
    budget,
    owner,
    specs[0]!.repository!,
    state.installations
  );
  const headers = { ...GITHUB_HEADERS, Authorization: `Bearer ${bearer}` };
  const { repos, query } = buildShipQuery(specs);
  const recent =
    options.lastReadAt !== null &&
    deps.now() - options.lastReadAt < UNCHANGED_REUSE_MS;
  if (!options.force && recent) {
    let unchanged = true;
    for (const repository of repos) {
      const etag = state.etags[repository];
      const probe = await shipFetch(
        deps,
        budget,
        new URL(`/repos/${repository}/actions/runs?per_page=1`, GITHUB_API),
        {
          method: 'GET',
          headers: etag ? { ...headers, 'If-None-Match': etag } : headers,
        }
      );
      const next = probe.headers.get('etag');
      if (next && next.length <= 200) state.etags[repository] = next;
      if (probe.status !== 304) unchanged = false;
    }
    if (unchanged) return { kind: 'unchanged' };
  }
  const response = await shipFetch(
    deps,
    budget,
    new URL('/graphql', GITHUB_API),
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }
  );
  if (response.status !== 200) throw new ShipSourceError('invalid');
  const parsed = parseShipResponse(response.json, specs, repos, deps.now());
  let followUps = parsed.followUps;
  for (let page = 0; page < MAX_FOLLOW_UP_PAGES && followUps.length; page++) {
    const more = await shipFetch(
      deps,
      budget,
      new URL('/graphql', GITHUB_API),
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: buildFollowUpQuery(followUps) }),
      }
    );
    if (more.status !== 200) throw new ShipSourceError('invalid');
    followUps = applyFollowUps(more.json, followUps, parsed.facts);
  }
  return { kind: 'read', facts: parsed.facts, retryAt: parsed.retryAt };
}
