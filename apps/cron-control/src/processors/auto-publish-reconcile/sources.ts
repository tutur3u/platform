import {
  isoOrNull,
  type RequestBudget,
  SHA,
  type ShipFetchDeps,
  ShipSourceError,
  shipFetch,
} from '../mastermind-ship/http';
import {
  FENCE_VARIABLE,
  MAX_VARIABLE_PAGES,
  RECONCILE_REPOSITORY,
  VARIABLES_PER_PAGE,
} from './catalog';

// Read-only provider reads for the auto-publish reconciler. Every request is
// a GET through the shared bounded fetch (per-request timeout inside the run
// deadline, request budget, 1 MiB body cap, redirects refused) and none is
// retried in the run: the next hourly slot is the retry.

const GITHUB_API = 'https://api.github.com/';
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4/';
const ACCOUNT = /^[0-9a-f]{32}$/u;
const SCRIPT = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const MIN_TOKEN_LENGTH = 20;

export interface ReconcileCredentialsEnv {
  /** Account id the reads target (existing Cron Control text binding). */
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** Account-scoped Workers Scripts Read token; no write permission. */
  AUTO_PUBLISH_RECONCILE_CLOUDFLARE_TOKEN?: string;
  /**
   * Fine-grained token for tutur3u/platform only: Variables read and
   * Contents read. It cannot change variables, refs or settings.
   */
  AUTO_PUBLISH_RECONCILE_GITHUB_TOKEN?: string;
}

function token(value: string | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length >= MIN_TOKEN_LENGTH ? trimmed : null;
}

export function githubToken(env: ReconcileCredentialsEnv) {
  return token(env.AUTO_PUBLISH_RECONCILE_GITHUB_TOKEN);
}

export function cloudflareCredentials(env: ReconcileCredentialsEnv) {
  const secret = token(env.AUTO_PUBLISH_RECONCILE_CLOUDFLARE_TOKEN);
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '';
  return secret && ACCOUNT.test(account) ? { account, token: secret } : null;
}

function githubHeaders(secret: string, userAgent: string) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${secret}`,
    'User-Agent': userAgent,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export interface FenceVariable {
  name: string;
  /** Exactly 'stopped', or 'stopped:' followed by an optional detail. */
  stopped: boolean;
  /** Epoch ms of a `stopped:<ISO until>[:reason]` expiry, when present. */
  until: number | null;
  updatedAt: number;
}

/** `stopped`, or `stopped:<until>[:reason]`; any other value publishes. */
export function parseFenceValue(value: string) {
  const text = value.trim();
  if (text === 'stopped') return { stopped: true, until: null };
  if (!text.startsWith('stopped:')) return { stopped: false, until: null };
  const rest = text.slice('stopped:'.length);
  // An ISO instant has colons of its own; the reason follows a 'Z' or offset.
  const match = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2}))/u.exec(
    rest
  );
  const until = match ? Date.parse(match[1]!) : Number.NaN;
  return { stopped: true, until: Number.isFinite(until) ? until : null };
}

/**
 * Lists the repository's Actions variables (at most MAX_VARIABLE_PAGES pages)
 * and keeps only the auto-publish fence names. A listing longer than the page
 * cap is a source failure, so a fence can never be missed silently.
 */
export async function readFenceVariables(
  deps: ShipFetchDeps,
  budget: RequestBudget,
  secret: string,
  userAgent: string
): Promise<FenceVariable[]> {
  const fences: FenceVariable[] = [];
  let seen = 0;
  for (let page = 1; page <= MAX_VARIABLE_PAGES; page++) {
    const url = new URL(
      `repos/${RECONCILE_REPOSITORY}/actions/variables`,
      GITHUB_API
    );
    url.searchParams.set('per_page', String(VARIABLES_PER_PAGE));
    url.searchParams.set('page', String(page));
    const read = await shipFetch(deps, budget, url, {
      method: 'GET',
      headers: githubHeaders(secret, userAgent),
    });
    if (read.status !== 200) throw new ShipSourceError('invalid');
    const body = read.json as { total_count?: unknown; variables?: unknown };
    const total = body?.total_count;
    if (
      typeof total !== 'number' ||
      !Number.isInteger(total) ||
      total < 0 ||
      !Array.isArray(body.variables)
    )
      throw new ShipSourceError('invalid');
    if (total > MAX_VARIABLE_PAGES * VARIABLES_PER_PAGE)
      throw new ShipSourceError('invalid');
    for (const entry of body.variables as Record<string, unknown>[]) {
      seen++;
      const name = entry?.name;
      if (typeof name !== 'string' || !FENCE_VARIABLE.test(name)) continue;
      const updated = isoOrNull(entry.updated_at ?? entry.created_at);
      if (typeof entry.value !== 'string' || !updated)
        throw new ShipSourceError('invalid');
      fences.push({
        name,
        ...parseFenceValue(entry.value),
        updatedAt: Date.parse(updated),
      });
    }
    if (seen >= total || body.variables.length < VARIABLES_PER_PAGE)
      return fences;
  }
  throw new ShipSourceError('invalid');
}

/** The commit SHA the `production` branch points at. */
export async function readProductionSha(
  deps: ShipFetchDeps,
  budget: RequestBudget,
  secret: string,
  userAgent: string
): Promise<string> {
  const read = await shipFetch(
    deps,
    budget,
    new URL(
      `repos/${RECONCILE_REPOSITORY}/git/ref/heads/production`,
      GITHUB_API
    ),
    { method: 'GET', headers: githubHeaders(secret, userAgent) }
  );
  const sha =
    read.status === 200
      ? (read.json as { object?: { sha?: unknown } })?.object?.sha
      : null;
  if (typeof sha !== 'string' || !SHA.test(sha))
    throw new ShipSourceError('invalid');
  return sha;
}

export interface ActiveDeployment {
  createdAt: number;
  deploymentId: string;
  /** Every version in the active deployment with its traffic share. */
  versions: { percentage: number; versionId: string }[];
}

/** The deployment serving traffic (Cloudflare lists it first). */
export async function readActiveDeployment(
  deps: ShipFetchDeps,
  budget: RequestBudget,
  credentials: { account: string; token: string },
  script: string
): Promise<ActiveDeployment | null> {
  if (!SCRIPT.test(script)) throw new ShipSourceError('invalid');
  const read = await shipFetch(
    deps,
    budget,
    new URL(
      `accounts/${credentials.account}/workers/scripts/${script}/deployments`,
      CLOUDFLARE_API
    ),
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${credentials.token}` },
      allowNotFound: true,
    }
  );
  if (read.status === 404) return null;
  const json =
    read.status === 200 ? (read.json as Record<string, unknown>) : {};
  const deployments =
    json?.success === true
      ? (json.result as { deployments?: unknown } | null)?.deployments
      : null;
  if (!Array.isArray(deployments)) throw new ShipSourceError('invalid');
  const active = deployments[0] as Record<string, unknown> | undefined;
  if (!active) return null;
  const created = isoOrNull(active.created_on);
  const id = active.id;
  if (!created || typeof id !== 'string' || !Array.isArray(active.versions))
    throw new ShipSourceError('invalid');
  const versions = (active.versions as Record<string, unknown>[]).map(
    (entry) => {
      if (
        typeof entry?.version_id !== 'string' ||
        typeof entry.percentage !== 'number' ||
        !Number.isFinite(entry.percentage)
      )
        throw new ShipSourceError('invalid');
      return { percentage: entry.percentage, versionId: entry.version_id };
    }
  );
  if (versions.length === 0) throw new ShipSourceError('invalid');
  return { createdAt: Date.parse(created), deploymentId: id, versions };
}

/** The commit the Worker's public build-info reports, or null if absent. */
export async function readBuildInfoSha(
  deps: ShipFetchDeps,
  budget: RequestBudget,
  url: string,
  userAgent: string
): Promise<string | null> {
  const read = await shipFetch(deps, budget, new URL(url), {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': userAgent },
  });
  const body =
    read.status === 200 ? (read.json as Record<string, unknown>) : null;
  const sha = body?.commitHash ?? body?.commit;
  return typeof sha === 'string' && SHA.test(sha) ? sha : null;
}
